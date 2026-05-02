import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadProjectConfig,
	ProjectConfigNotFoundException,
	resolveProjectConfigPaths,
	updateProjectConfig,
} from '../../src/config';
import type { Config } from '../../src/types';

let testDir: string;

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), 'agentuity-project-config-paths-'));
});

afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

function projectConfig(projectId: string, orgId = 'org_test123') {
	return {
		projectId,
		orgId,
		region: 'usc',
	};
}

async function writeProjectConfig(path: string, projectId: string, orgId?: string) {
	await Bun.write(path, JSON.stringify(projectConfig(projectId, orgId), null, 2) + '\n');
}

describe('project config path resolution', () => {
	test('loads an explicit agentuity.json file and uses its parent as projectDir', async () => {
		const configPath = join(testDir, 'agentuity.json');
		await writeProjectConfig(configPath, 'proj_default');

		const resolved = await resolveProjectConfigPaths(configPath);
		const project = await loadProjectConfig(configPath);

		expect(resolved.projectDir).toBe(testDir);
		expect(resolved.configPath).toBe(configPath);
		expect(resolved.explicitConfigFile).toBe(true);
		expect(project.projectId).toBe('proj_default');
	});

	test('loads an explicit custom JSON file', async () => {
		const configPath = join(testDir, 'agentuity.org-a.json');
		await writeProjectConfig(configPath, 'proj_org_a', 'org_a');

		const project = await loadProjectConfig(configPath, { name: 'production' });

		expect(project.projectId).toBe('proj_org_a');
		expect(project.orgId).toBe('org_a');
	});

	test('does not apply profile-specific fallback for explicit JSON files', async () => {
		const config: Config = { name: 'staging' };
		const explicitPath = join(testDir, 'custom.json');
		const profilePath = join(testDir, 'agentuity.staging.json');
		await writeProjectConfig(explicitPath, 'proj_explicit');
		await writeProjectConfig(profilePath, 'proj_profile');

		const project = await loadProjectConfig(explicitPath, config);

		expect(project.projectId).toBe('proj_explicit');
	});

	test('keeps existing directories ending in .json as directories', async () => {
		const jsonDir = join(testDir, 'fixture.json');
		await mkdir(jsonDir);
		await writeProjectConfig(join(jsonDir, 'agentuity.json'), 'proj_json_dir');

		const resolved = await resolveProjectConfigPaths(jsonDir);
		const project = await loadProjectConfig(jsonDir);

		expect(resolved.projectDir).toBe(jsonDir);
		expect(resolved.configPath).toBe(join(jsonDir, 'agentuity.json'));
		expect(resolved.explicitConfigFile).toBe(false);
		expect(project.projectId).toBe('proj_json_dir');
	});

	test('throws a clear error for a missing explicit JSON file', async () => {
		const missingPath = join(testDir, 'missing.json');

		expect(loadProjectConfig(missingPath)).rejects.toThrow(ProjectConfigNotFoundException);
		expect(loadProjectConfig(missingPath)).rejects.toThrow(missingPath);
	});

	test('updates the exact explicit JSON file that was loaded', async () => {
		const defaultPath = join(testDir, 'agentuity.json');
		const explicitPath = join(testDir, 'custom.json');
		await writeProjectConfig(defaultPath, 'proj_default');
		await writeProjectConfig(explicitPath, 'proj_custom');

		await loadProjectConfig(explicitPath);
		await updateProjectConfig(testDir, { skipGitSetup: true });

		const defaultConfig = await Bun.file(defaultPath).json();
		const explicitConfig = await Bun.file(explicitPath).json();

		expect(defaultConfig.skipGitSetup).toBeUndefined();
		expect(explicitConfig.skipGitSetup).toBe(true);
	});

	test('updates an explicit JSON file path even when another config was loaded first', async () => {
		const defaultPath = join(testDir, 'agentuity.json');
		const explicitPath = join(testDir, 'custom.json');
		await writeProjectConfig(defaultPath, 'proj_default');
		await writeProjectConfig(explicitPath, 'proj_custom');

		await loadProjectConfig(testDir);
		await updateProjectConfig(explicitPath, { skipGitSetup: true });

		const defaultConfig = await Bun.file(defaultPath).json();
		const explicitConfig = await Bun.file(explicitPath).json();

		expect(defaultConfig.skipGitSetup).toBeUndefined();
		expect(explicitConfig.skipGitSetup).toBe(true);
	});
});
