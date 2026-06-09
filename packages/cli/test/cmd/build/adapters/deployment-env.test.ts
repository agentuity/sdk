/**
 * Deployment Env Injection Tests
 *
 * Custom (adapter-run) build commands need a stable, documented way to
 * learn the deploymentId at build time — e.g. to set a Vite `base` of
 * `https://cdn.agentuity.com/<deploymentId>/client/` so static assets
 * are served from the CDN instead of the app container. Native
 * Agentuity builds get this via the Vite pipeline's `--base` injection;
 * these tests pin the equivalent contract for adapter builds:
 *
 * 1. When the pipeline has a deploymentId, the build subprocess sees it
 *    as AGENTUITY_DEPLOYMENT_ID.
 * 2. When there is no deploymentId (plain `agentuity build`), the
 *    variable is not set.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockLogger } from '@agentuity/test-utils';
import { detectFrameworkWithPackageJson } from '../../../../src/cmd/build/detect';
import { getAdapter } from '../../../../src/cmd/build/adapters';

// ── Helpers ──

function createTestDir(): string {
	const dir = join(
		tmpdir(),
		`deployment-env-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writePackageJson(dir: string, content: Record<string, unknown>) {
	writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

const logger = createMockLogger();

// The build script captures what the subprocess actually sees. `MISSING`
// distinguishes "unset" from "set to empty string".
const captureBuildScript = [
	'mkdir -p dist',
	// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, expanded by sh in the build subprocess, not JS
	'echo "${AGENTUITY_DEPLOYMENT_ID:-MISSING}" > dist/env-capture.txt',
	'echo "<html></html>" > dist/index.html',
].join(' && ');

// Read from the project's own dist/ (where the build script wrote it)
// so the assertion is independent of the adapter's output-copy layout.
function readCapture(projectDir: string): string {
	return readFileSync(join(projectDir, 'dist', 'env-capture.txt'), 'utf-8').trim();
}

// ── Tests ──

describe('Deployment env injection for adapter builds', () => {
	let testDir: string;
	let outputDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		outputDir = join(testDir, '.agentuity');
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('build subprocess sees AGENTUITY_DEPLOYMENT_ID when deploymentId is set', async () => {
		writePackageJson(testDir, {
			name: 'test-deployment-env',
			version: '1.0.0',
			scripts: {
				build: captureBuildScript,
			},
			devDependencies: {
				vite: '^6.0.0',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();
		expect(framework!.name).toBe('vite');

		const adapter = getAdapter(framework!.name);
		await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
			deploymentId: 'deploy_test_12345',
		});

		expect(readCapture(testDir)).toBe('deploy_test_12345');
	});

	test('AGENTUITY_DEPLOYMENT_ID is not set when there is no deploymentId', async () => {
		writePackageJson(testDir, {
			name: 'test-deployment-env-absent',
			version: '1.0.0',
			scripts: {
				build: captureBuildScript,
			},
			devDependencies: {
				vite: '^6.0.0',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();

		const adapter = getAdapter(framework!.name);
		await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		expect(readCapture(testDir)).toBe('MISSING');
	});

	test('clears a stale AGENTUITY_DEPLOYMENT_ID inherited from the CLI process env', async () => {
		// The build subprocess env inherits process.env, so a value
		// exported in the user's shell must be actively unset for a
		// non-deploy build — omitting the key is not enough.
		process.env.AGENTUITY_DEPLOYMENT_ID = 'stale_from_shell';
		try {
			writePackageJson(testDir, {
				name: 'test-deployment-env-stale',
				version: '1.0.0',
				scripts: {
					build: captureBuildScript,
				},
				devDependencies: {
					vite: '^6.0.0',
				},
			});

			const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
			expect(framework).not.toBeNull();

			const adapter = getAdapter(framework!.name);
			await adapter.build({
				projectDir: testDir,
				framework: framework!,
				packageJson: packageJson!,
				outputDir,
				logger,
			});

			expect(readCapture(testDir)).toBe('MISSING');
		} finally {
			delete process.env.AGENTUITY_DEPLOYMENT_ID;
		}
	});
});
