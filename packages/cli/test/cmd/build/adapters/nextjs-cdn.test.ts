import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareNextCdnBuild } from '../../../../src/cmd/build/adapters/cdn-recipes.ts';
import { PACK_ONLY_DEPLOYMENT_ID } from '../../../../src/cmd/build/adapters/cdn-origin.ts';
import { getAdapter } from '../../../../src/cmd/build/adapters';

function makeDir(): string {
	const dir = join(tmpdir(), `next-cdn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe('prepareNextCdnBuild', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('no-op without cdn base or deployment id', () => {
		const dir = makeDir();
		dirs.push(dir);
		const prep = prepareNextCdnBuild({
			projectDir: dir,
			logger: { debug: () => {} },
			env: {},
		});
		expect(prep.cdnOrigin).toBeUndefined();
		expect(prep.buildEnv).toEqual({});
		prep.cleanup();
	});

	test('honors --cdn-base-url and writes temporary next.config.js', () => {
		const dir = makeDir();
		dirs.push(dir);
		const prep = prepareNextCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/org_1/assets/',
			logger: { debug: () => {} },
			env: {},
		});
		expect(prep.cdnOrigin).toBe('https://cdn.agentuity.com/org_1/assets');
		expect(prep.buildEnv.AGENTUITY_CDN_ORIGIN).toBe('https://cdn.agentuity.com/org_1/assets');
		expect(existsSync(join(dir, 'next.config.js'))).toBe(true);
		const body = readFileSync(join(dir, 'next.config.js'), 'utf-8');
		expect(body).toContain('assetPrefix');
		expect(body).toContain('AGENTUITY_CDN_ORIGIN');
		prep.cleanup();
		expect(existsSync(join(dir, 'next.config.js'))).toBe(false);
	});

	test('wraps existing next.config.mjs without assetPrefix', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(
			join(dir, 'next.config.mjs'),
			'export default { reactStrictMode: true };\n',
			'utf-8'
		);
		const prep = prepareNextCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/',
			logger: { debug: () => {} },
			env: {},
		});
		expect(existsSync(join(dir, 'next.config.agentuity-orig.mjs'))).toBe(true);
		const wrapper = readFileSync(join(dir, 'next.config.mjs'), 'utf-8');
		expect(wrapper).toContain('assetPrefix');
		expect(wrapper).toContain('next.config.agentuity-orig');
		prep.cleanup();
		expect(existsSync(join(dir, 'next.config.agentuity-orig.mjs'))).toBe(false);
		expect(readFileSync(join(dir, 'next.config.mjs'), 'utf-8')).toContain('reactStrictMode');
	});

	test('wraps next.config.ts without assetPrefix', () => {
		const dir = makeDir();
		dirs.push(dir);
		writeFileSync(
			join(dir, 'next.config.ts'),
			'import type { NextConfig } from "next";\nconst nextConfig: NextConfig = {};\nexport default nextConfig;\n',
			'utf-8'
		);
		const prep = prepareNextCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/org_x/assets/',
			logger: { debug: () => {} },
			env: {},
		});
		expect(existsSync(join(dir, 'next.config.agentuity-orig.ts'))).toBe(true);
		const wrapper = readFileSync(join(dir, 'next.config.ts'), 'utf-8');
		expect(wrapper).toContain('assetPrefix');
		expect(wrapper).toContain('next.config.agentuity-orig');
		prep.cleanup();
		expect(existsSync(join(dir, 'next.config.agentuity-orig.ts'))).toBe(false);
		expect(readFileSync(join(dir, 'next.config.ts'), 'utf-8')).toContain('NextConfig');
	});

	test('does not wrap when assetPrefix already present', () => {
		const dir = makeDir();
		dirs.push(dir);
		const original = 'export default { assetPrefix: "https://other.cdn" };\n';
		writeFileSync(join(dir, 'next.config.mjs'), original, 'utf-8');
		const prep = prepareNextCdnBuild({
			projectDir: dir,
			cdnBaseUrl: 'https://cdn.agentuity.com/',
			logger: { debug: () => {} },
			env: {},
		});
		expect(readFileSync(join(dir, 'next.config.mjs'), 'utf-8')).toBe(original);
		expect(existsSync(join(dir, 'next.config.agentuity-orig.mjs'))).toBe(false);
		prep.cleanup();
	});

	test('pack-only deployment id alone is not enough without explicit base', () => {
		const dir = makeDir();
		dirs.push(dir);
		const prep = prepareNextCdnBuild({
			projectDir: dir,
			deploymentId: PACK_ONLY_DEPLOYMENT_ID,
			logger: { debug: () => {} },
			env: {},
		});
		expect(prep.cdnOrigin).toBeUndefined();
		prep.cleanup();
	});
});

describe('Next.js adapter registry', () => {
	test('getAdapter(nextjs) returns nextjs adapter', () => {
		expect(getAdapter('nextjs').name).toBe('nextjs');
	});
});
