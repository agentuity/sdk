import { afterEach, describe, expect, test } from 'bun:test';
import { createMockLogger } from '@agentuity/test-utils';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareSvelteKitCdnBuild } from '../../../../src/cmd/build/adapters/cdn-recipes.ts';
import { getAdapter } from '../../../../src/cmd/build/adapters';

function makeDir(): string {
	const dir = join(tmpdir(), `sk-cdn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	// Real SvelteKit apps are ESM; bare .js configs load as CJS without this.
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf-8');
	return dir;
}

describe('prepareSvelteKitCdnBuild', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('swaps adapter-auto and wraps with paths.assets', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(
			join(dir, 'svelte.config.js'),
			`import adapter from '@sveltejs/adapter-auto';\nexport default { kit: { adapter: adapter() } };\n`,
			'utf-8'
		);

		const prep = prepareSvelteKitCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/org_x/assets/',
			logger: createMockLogger(),
			env: {},
		});

		expect(prep.cdnOrigin).toBe('https://cdn.agentuity.com/org_x/assets');
		expect(prep.buildEnv.AGENTUITY_CDN_ORIGIN).toBe('https://cdn.agentuity.com/org_x/assets');
		// Backup has adapter-node (post-swap)
		const backup = readFileSync(join(dir, 'svelte.config.agentuity-orig.js'), 'utf-8');
		expect(backup).toContain('@sveltejs/adapter-node');
		expect(backup).not.toContain('@sveltejs/adapter-auto');
		// Wrapper mentions paths.assets merge
		expect(readFileSync(join(dir, 'svelte.config.js'), 'utf-8')).toContain('paths');

		prep.cleanup();
		// Restored to original adapter-auto
		const restored = readFileSync(join(dir, 'svelte.config.js'), 'utf-8');
		expect(restored).toContain('@sveltejs/adapter-auto');
		expect(existsSync(join(dir, 'svelte.config.agentuity-orig.js'))).toBe(false);
	});

	test('still swaps adapter without CDN base', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(
			join(dir, 'svelte.config.js'),
			`import adapter from '@sveltejs/adapter-auto';\nexport default { kit: { adapter: adapter() } };\n`,
			'utf-8'
		);

		const prep = prepareSvelteKitCdnBuild({
			projectDir: dir,
			logger: createMockLogger(),
			env: {},
		});

		expect(prep.cdnOrigin).toBeUndefined();
		expect(readFileSync(join(dir, 'svelte.config.js'), 'utf-8')).toContain('adapter-node');
		prep.cleanup();
		expect(readFileSync(join(dir, 'svelte.config.js'), 'utf-8')).toContain('adapter-auto');
	});

	test('preserves existing paths.assets via merge (still wraps)', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(
			join(dir, 'svelte.config.js'),
			`import adapter from '@sveltejs/adapter-node';\nexport default { kit: { adapter: adapter(), paths: { assets: 'https://other.cdn' } } };\n`,
			'utf-8'
		);

		const prep = prepareSvelteKitCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/',
			logger: createMockLogger(),
			env: {},
		});

		// Always wraps; merge body keeps paths.assets when set
		expect(existsSync(join(dir, 'svelte.config.agentuity-orig.js'))).toBe(true);
		const wrapper = readFileSync(join(dir, 'svelte.config.js'), 'utf-8');
		expect(wrapper).toContain('paths.assets');
		prep.cleanup();
	});
});

describe('SvelteKit adapter registry', () => {
	test('getAdapter(sveltekit) returns sveltekit adapter', () => {
		expect(getAdapter('sveltekit').name).toBe('sveltekit');
	});
});
