import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	injectViteBaseFlag,
	PACK_ONLY_DEPLOYMENT_ID,
	patchViteConfigCdnBase,
	prepareViteCdnBuild,
	resolveViteCdnBase,
} from '../../../../src/cmd/build/adapters/vite/cdn-build.ts';
import { getAdapter } from '../../../../src/cmd/build/adapters';

describe('Vite CDN base resolution', () => {
	test('prefers AGENTUITY_CDN_ORIGIN', () => {
		expect(
			resolveViteCdnBase({
				deploymentId: 'deploy_other',
				env: { AGENTUITY_CDN_ORIGIN: 'https://cdn.example.com/deploy_abc/' },
			})
		).toBe('https://cdn.example.com/deploy_abc/');
	});

	test('falls back to deployment id CDN host', () => {
		expect(resolveViteCdnBase({ deploymentId: 'deploy_abc123', env: {} })).toBe(
			'https://cdn.agentuity.com/deploy_abc123/'
		);
	});

	test('skips pack-only deployment id', () => {
		expect(
			resolveViteCdnBase({ deploymentId: PACK_ONLY_DEPLOYMENT_ID, env: {} })
		).toBeUndefined();
	});

	test('skips when no id and no origin', () => {
		expect(resolveViteCdnBase({ env: {} })).toBeUndefined();
	});
});

describe('injectViteBaseFlag', () => {
	const base = 'https://cdn.agentuity.com/deploy_x/';

	test('appends --base to vite build', () => {
		expect(injectViteBaseFlag('vite build', base)).toBe(`vite build --base=${base}`);
	});

	test('appends only to the vite segment of compound commands', () => {
		expect(injectViteBaseFlag('tsc -b && vite build', base)).toBe(
			`tsc -b && vite build --base=${base}`
		);
		expect(injectViteBaseFlag('vite build && echo done', base)).toBe(
			`vite build --base=${base} && echo done`
		);
		expect(injectViteBaseFlag('tsc -b && vite build || echo fail', base)).toBe(
			`tsc -b && vite build --base=${base} || echo fail`
		);
	});

	test('no-op when --base already present on the vite segment', () => {
		const cmd = `vite build --base=${base}`;
		expect(injectViteBaseFlag(cmd, base)).toBe(cmd);
	});

	test('no-op when vite is not invoked', () => {
		expect(injectViteBaseFlag('bun run compile', base)).toBe('bun run compile');
	});
});

describe('patchViteConfigCdnBase', () => {
	const base = 'https://cdn.agentuity.com/deploy_x/';

	test('injects base when missing', () => {
		const source = `import { defineConfig } from 'vite';\nexport default defineConfig({\n\tplugins: [],\n});\n`;
		const { content, changed } = patchViteConfigCdnBase(source, base);
		expect(changed).toBe(true);
		expect(content).toContain(`base: ${JSON.stringify(base)}`);
	});

	test('replaces base slash', () => {
		const source = `export default defineConfig({ base: '/', plugins: [] });`;
		const { content, changed } = patchViteConfigCdnBase(source, base);
		expect(changed).toBe(true);
		expect(content).toContain(`base: ${JSON.stringify(base)}`);
		expect(content).not.toContain("base: '/'");
	});

	test('leaves custom path base unchanged', () => {
		const source = `export default defineConfig({ base: '/app/', plugins: [] });`;
		const { changed } = patchViteConfigCdnBase(source, base);
		expect(changed).toBe(false);
	});

	test('leaves already-CDN base unchanged via generic base branch', () => {
		const source = `export default defineConfig({ base: ${JSON.stringify(base)}, plugins: [] });`;
		const { changed } = patchViteConfigCdnBase(source, base);
		expect(changed).toBe(false);
	});
});

describe('prepareViteCdnBuild', () => {
	let testDir: string;

	afterEach(() => {
		if (testDir && existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('injects --base and CDN env, then cleanup restores command', async () => {
		testDir = join(import.meta.dir, `.tmp-vite-cdn-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		const framework = {
			buildCommand: 'vite build',
			buildEnv: { EXISTING: '1' } as Record<string, string> | undefined,
		};

		const prep = await prepareViteCdnBuild({
			projectDir: testDir,
			deploymentId: 'deploy_test99',
			framework,
			logger: { debug: () => {} },
			env: {},
		});

		expect(prep.cdnBase).toBe('https://cdn.agentuity.com/deploy_test99/');
		expect(framework.buildCommand).toBe(
			'vite build --base=https://cdn.agentuity.com/deploy_test99/'
		);
		expect(framework.buildEnv?.AGENTUITY_CDN_ORIGIN).toBe(
			'https://cdn.agentuity.com/deploy_test99'
		);
		expect(framework.buildEnv?.AGENTUITY_CLOUD_DEPLOYMENT_ID).toBe('deploy_test99');
		expect(framework.buildEnv?.EXISTING).toBe('1');
		expect(prep.logs.some((line) => line.includes('Vite CDN base via CLI'))).toBe(true);

		await prep.cleanup();

		expect(framework.buildCommand).toBe('vite build');
		expect(framework.buildEnv).toEqual({ EXISTING: '1' });
	});

	test('patches vite.config when build command does not invoke vite', async () => {
		testDir = join(import.meta.dir, `.tmp-vite-cdn-cfg-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		const configPath = join(testDir, 'vite.config.ts');
		const original = `import { defineConfig } from 'vite';\nexport default defineConfig({\n\tplugins: [],\n});\n`;
		writeFileSync(configPath, original, 'utf-8');

		const framework = {
			buildCommand: 'bun run build:client',
			buildEnv: undefined as Record<string, string> | undefined,
		};

		const prep = await prepareViteCdnBuild({
			projectDir: testDir,
			deploymentId: 'deploy_cfg',
			framework,
			logger: { debug: () => {} },
			env: {},
		});

		expect(readFileSync(configPath, 'utf-8')).toContain('https://cdn.agentuity.com/deploy_cfg/');
		expect(prep.logs.some((line) => line.includes('vite.config.ts'))).toBe(true);

		await prep.cleanup();
		expect(readFileSync(configPath, 'utf-8')).toBe(original);
	});

	test('rolls back mutations when config patch I/O fails', async () => {
		testDir = join(import.meta.dir, `.tmp-vite-cdn-fail-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		// Directory named like a vite config file — readFile will fail (EISDIR).
		const bogusConfig = join(testDir, 'vite.config.ts');
		mkdirSync(bogusConfig);

		const framework = {
			buildCommand: 'bun run build:client',
			buildEnv: { EXISTING: '1' } as Record<string, string> | undefined,
		};

		await expect(
			prepareViteCdnBuild({
				projectDir: testDir,
				deploymentId: 'deploy_fail',
				framework,
				logger: { debug: () => {} },
				env: {},
			})
		).rejects.toThrow();

		expect(framework.buildCommand).toBe('bun run build:client');
		expect(framework.buildEnv).toEqual({ EXISTING: '1' });
	});

	test('no-op for pack-only', async () => {
		const framework = { buildCommand: 'vite build' };
		const prep = await prepareViteCdnBuild({
			projectDir: '/tmp',
			deploymentId: PACK_ONLY_DEPLOYMENT_ID,
			framework,
			logger: { debug: () => {} },
			env: {},
		});
		expect(prep.cdnBase).toBeUndefined();
		expect(framework.buildCommand).toBe('vite build');
		expect(prep.logs).toEqual([]);
		await prep.cleanup();
	});
});

describe('Vite adapter registry', () => {
	test('getAdapter(vite) returns vite adapter', () => {
		const adapter = getAdapter('vite');
		expect(adapter.name).toBe('vite');
	});
});
