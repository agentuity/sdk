import { afterEach, describe, expect, test } from 'bun:test';
import { createMockLogger } from '@agentuity/test-utils';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareAstroCdnBuild } from '../../../../src/cmd/build/adapters/cdn-recipes.ts';
import { PACK_ONLY_DEPLOYMENT_ID } from '../../../../src/cmd/build/adapters/cdn-origin.ts';
import { getAdapter } from '../../../../src/cmd/build/adapters';

function makeDir(): string {
	const dir = join(tmpdir(), `astro-cdn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe('prepareAstroCdnBuild', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('no-op without cdn base', () => {
		const dir = makeDir();
		dirs.push(dir);
		const prep = prepareAstroCdnBuild({
			projectDir: dir,
			logger: createMockLogger(),
			env: {},
		});
		expect(prep.cdnOrigin).toBeUndefined();
		expect(prep.buildEnv).toEqual({});
		prep.cleanup();
	});

	test('wraps astro.config.mjs and sets env from --cdn-base-url', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(
			join(dir, 'astro.config.mjs'),
			`import { defineConfig } from 'astro/config';\nexport default defineConfig({ site: 'https://example.com' });\n`,
			'utf-8'
		);

		const prep = prepareAstroCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/org_1/assets/',
			logger: createMockLogger(),
			env: {},
		});

		expect(prep.cdnOrigin).toBe('https://cdn.agentuity.com/org_1/assets');
		expect(prep.buildEnv.AGENTUITY_CDN_ORIGIN).toBe('https://cdn.agentuity.com/org_1/assets');
		expect(existsSync(join(dir, 'astro.config.agentuity-orig.mjs'))).toBe(true);
		const wrapper = readFileSync(join(dir, 'astro.config.mjs'), 'utf-8');
		expect(wrapper).toContain('assetsPrefix');
		expect(wrapper).toContain('AGENTUITY_CDN_ORIGIN');

		prep.cleanup();
		expect(existsSync(join(dir, 'astro.config.agentuity-orig.mjs'))).toBe(false);
		expect(readFileSync(join(dir, 'astro.config.mjs'), 'utf-8')).toContain('example.com');
	});

	test('does not wrap when assetsPrefix already present', () => {
		const dir = makeDir();
		dirs.push(dir);
		const original = "export default { build: { assetsPrefix: 'https://other.cdn' } };\n";
		writeFileSync(join(dir, 'astro.config.mjs'), original, 'utf-8');

		const prep = prepareAstroCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/',
			logger: createMockLogger(),
			env: {},
		});

		expect(readFileSync(join(dir, 'astro.config.mjs'), 'utf-8')).toBe(original);
		prep.cleanup();
	});

	test('pack-only alone is not enough', () => {
		const dir = makeDir();
		dirs.push(dir);
		const prep = prepareAstroCdnBuild({
			projectDir: dir,
			deploymentId: PACK_ONLY_DEPLOYMENT_ID,
			logger: createMockLogger(),
			env: {},
		});
		expect(prep.cdnOrigin).toBeUndefined();
		prep.cleanup();
	});
});

describe('Astro adapter registry', () => {
	test('getAdapter(astro) returns astro adapter', () => {
		expect(getAdapter('astro').name).toBe('astro');
	});
});
