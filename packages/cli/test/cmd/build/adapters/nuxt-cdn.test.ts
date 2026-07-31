import { afterEach, describe, expect, test } from 'bun:test';
import { createMockLogger } from '@agentuity/test-utils';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareNuxtCdnBuild } from '../../../../src/cmd/build/adapters/cdn-recipes.ts';
import { getAdapter } from '../../../../src/cmd/build/adapters';

function makeDir(): string {
	const dir = join(tmpdir(), `nuxt-cdn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe('prepareNuxtCdnBuild', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('wraps nuxt.config.ts and sets NUXT_APP_CDN_URL', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(
			join(dir, 'nuxt.config.ts'),
			`export default defineNuxtConfig({ compatibilityDate: '2025-07-15' });\n`,
			'utf-8'
		);

		const prep = prepareNuxtCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/org_1/assets/',
			logger: createMockLogger(),
			env: {},
		});

		expect(prep.cdnOrigin).toBe('https://cdn.agentuity.com/org_1/assets');
		expect(prep.buildEnv.NUXT_APP_CDN_URL).toBe('https://cdn.agentuity.com/org_1/assets/');
		expect(existsSync(join(dir, 'nuxt.config.agentuity-orig.ts'))).toBe(true);
		expect(readFileSync(join(dir, 'nuxt.config.ts'), 'utf-8')).toContain('cdnURL');

		prep.cleanup();
		expect(existsSync(join(dir, 'nuxt.config.agentuity-orig.ts'))).toBe(false);
		expect(readFileSync(join(dir, 'nuxt.config.ts'), 'utf-8')).toContain('compatibilityDate');
	});

	test('skips wrap when cdnURL already present', () => {
		const dir = makeDir();
		dirs.push(dir);
		const original = `export default { app: { cdnURL: 'https://other.cdn/' } };\n`;
		writeFileSync(join(dir, 'nuxt.config.ts'), original, 'utf-8');

		const prep = prepareNuxtCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/',
			logger: createMockLogger(),
			env: {},
		});

		expect(readFileSync(join(dir, 'nuxt.config.ts'), 'utf-8')).toBe(original);
		prep.cleanup();
	});
});

describe('Nuxt adapter registry', () => {
	test('getAdapter(nuxt) returns nuxt adapter', () => {
		expect(getAdapter('nuxt').name).toBe('nuxt');
	});
});
