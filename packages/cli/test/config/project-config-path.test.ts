import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadProjectConfig,
	resolveProjectConfigPath,
	updateProjectConfig,
} from '../../src/config.ts';
import type { Config } from '../../src/types.ts';

let testDir: string;

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), 'agentuity-project-config-'));
});

afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

function projectJson(overrides: Record<string, unknown> = {}) {
	return {
		projectId: 'proj_default',
		orgId: 'org_default',
		region: 'usc',
		...overrides,
	};
}

async function writeProjectConfig(filename: string, data: Record<string, unknown>) {
	const path = join(testDir, filename);
	await writeFile(path, JSON.stringify(data, null, 2) + '\n');
	return path;
}

describe('resolveProjectConfigPath', () => {
	test('defaults to agentuity.json in the project dir', async () => {
		const result = await resolveProjectConfigPath(testDir, null);
		expect(result.path).toBe(join(testDir, 'agentuity.json'));
		expect(result.explicit).toBe(false);
	});

	test('prefers profile-specific file when present', async () => {
		await writeProjectConfig(
			'agentuity.staging.json',
			projectJson({ projectId: 'proj_staging' })
		);
		const config = { name: 'staging' } as Config;
		const result = await resolveProjectConfigPath(testDir, config);
		expect(result.path).toBe(join(testDir, 'agentuity.staging.json'));
		expect(result.explicit).toBe(false);
	});

	test('uses explicit --project-config path over profile override', async () => {
		await writeProjectConfig(
			'agentuity.staging.json',
			projectJson({ projectId: 'proj_staging' })
		);
		const explicit = await writeProjectConfig(
			'agentuity.prod.json',
			projectJson({ projectId: 'proj_prod' })
		);
		const config = { name: 'staging' } as Config;
		const result = await resolveProjectConfigPath(testDir, config, { configPath: explicit });
		expect(result.path).toBe(explicit);
		expect(result.explicit).toBe(true);
	});

	test('resolves relative explicit paths against cwd', async () => {
		const filename = 'agentuity.relative.json';
		await writeProjectConfig(filename, projectJson());
		const prev = process.cwd();
		try {
			process.chdir(testDir);
			const result = await resolveProjectConfigPath(testDir, null, {
				configPath: filename,
			});
			// macOS temp dirs may be under /var vs /private/var — compare basenames + existence
			expect(result.path.endsWith(filename)).toBe(true);
			expect(result.explicit).toBe(true);
			expect(await Bun.file(result.path).exists()).toBe(true);
		} finally {
			process.chdir(prev);
		}
	});
});

describe('loadProjectConfig with --project-config', () => {
	test('loads alternate config file', async () => {
		await writeProjectConfig('agentuity.json', projectJson({ projectId: 'proj_default' }));
		const altPath = await writeProjectConfig(
			'agentuity.staging.json',
			projectJson({
				projectId: 'proj_staging',
				deployment: { domains: ['staging.example.com'] },
			})
		);

		const loaded = await loadProjectConfig(testDir, null, { configPath: altPath });
		expect(loaded.projectId).toBe('proj_staging');
		expect(loaded.deployment?.domains).toEqual(['staging.example.com']);
	});

	test('throws explicit not-found when alternate file is missing', async () => {
		const missing = join(testDir, 'agentuity.missing.json');
		try {
			await loadProjectConfig(testDir, null, { configPath: missing });
			expect.unreachable('should have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as { name: string }).name).toBe('ProjectConfigNotFoundException');
			expect((error as { explicit?: boolean }).explicit).toBe(true);
			expect((error as { configPath?: string }).configPath).toBe(missing);
		}
	});

	test('default missing file is not marked explicit', async () => {
		try {
			await loadProjectConfig(testDir, null);
			expect.unreachable('should have thrown');
		} catch (error) {
			expect((error as { name: string }).name).toBe('ProjectConfigNotFoundException');
			expect((error as { explicit?: boolean }).explicit).toBe(false);
		}
	});
});

describe('updateProjectConfig with --project-config', () => {
	test('writes updates back to the alternate config file', async () => {
		const altPath = await writeProjectConfig(
			'agentuity.staging.json',
			projectJson({ projectId: 'proj_staging', skipGitSetup: false })
		);
		// Default file should remain untouched
		await writeProjectConfig('agentuity.json', projectJson({ projectId: 'proj_default' }));

		await updateProjectConfig(testDir, { skipGitSetup: true }, null, { configPath: altPath });

		const updated = JSON.parse(await Bun.file(altPath).text());
		expect(updated.skipGitSetup).toBe(true);
		expect(updated.projectId).toBe('proj_staging');

		const defaultFile = JSON.parse(await Bun.file(join(testDir, 'agentuity.json')).text());
		expect(defaultFile.skipGitSetup).toBeUndefined();
		expect(defaultFile.projectId).toBe('proj_default');
	});
});
