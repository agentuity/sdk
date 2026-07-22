import { describe, expect, test } from 'bun:test';
import {
	PACK_ONLY_DEPLOYMENT_ID,
	prepareViteCdnBuild,
	resolveViteCdnBase,
} from '../../../../src/cmd/build/adapters/vite/cdn-build.ts';
import { injectViteBaseFlag } from '../../../../src/cmd/build/adapters/vite-cli-base.ts';
import { resolveAgentuityCdnOrigin } from '../../../../src/cmd/build/adapters/cdn-origin.ts';
import { getAdapter } from '../../../../src/cmd/build/adapters';

describe('CDN origin resolution', () => {
	test('prefers AGENTUITY_CDN_ORIGIN', () => {
		expect(
			resolveAgentuityCdnOrigin({
				deploymentId: 'deploy_other',
				env: { AGENTUITY_CDN_ORIGIN: 'https://cdn.example.com/deploy_abc/' },
			})
		).toBe('https://cdn.example.com/deploy_abc');
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

describe('prepareViteCdnBuild', () => {
	test('returns command/env overrides without mutating inputs', () => {
		const buildCommand = 'vite build';
		const buildEnv = { EXISTING: '1' };

		const prep = prepareViteCdnBuild({
			deploymentId: 'deploy_test99',
			buildCommand,
			buildEnv,
			logger: { debug: () => {} },
			env: {},
		});

		// Inputs unchanged (pure).
		expect(buildCommand).toBe('vite build');
		expect(buildEnv).toEqual({ EXISTING: '1' });

		expect(prep.cdnBase).toBe('https://cdn.agentuity.com/deploy_test99/');
		expect(prep.buildCommand).toBe('vite build --base=https://cdn.agentuity.com/deploy_test99/');
		expect(prep.buildEnv?.AGENTUITY_CDN_ORIGIN).toBe('https://cdn.agentuity.com/deploy_test99');
		expect(prep.buildEnv?.AGENTUITY_CLOUD_DEPLOYMENT_ID).toBe('deploy_test99');
		expect(prep.buildEnv?.EXISTING).toBe('1');
		expect(prep.logs.some((line) => line.includes('Vite CDN base via CLI'))).toBe(true);
	});

	test('warns when build command does not invoke vite', () => {
		const prep = prepareViteCdnBuild({
			deploymentId: 'deploy_cfg',
			buildCommand: 'bun run build:client',
			logger: { debug: () => {} },
			env: {},
		});

		expect(prep.buildCommand).toBe('bun run build:client');
		expect(prep.cdnBase).toBe('https://cdn.agentuity.com/deploy_cfg/');
		expect(prep.logs.some((line) => line.includes('does not invoke vite'))).toBe(true);
	});

	test('no-op for pack-only', () => {
		const prep = prepareViteCdnBuild({
			deploymentId: PACK_ONLY_DEPLOYMENT_ID,
			buildCommand: 'vite build',
			logger: { debug: () => {} },
			env: {},
		});
		expect(prep.cdnBase).toBeUndefined();
		expect(prep.buildCommand).toBe('vite build');
		expect(prep.logs).toEqual([]);
	});
});

describe('Vite adapter registry', () => {
	test('getAdapter(vite) returns vite adapter', () => {
		const adapter = getAdapter('vite');
		expect(adapter.name).toBe('vite');
	});
});
