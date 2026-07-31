import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	listStandaloneServers,
	selectStandaloneServer,
} from '../../../../src/cmd/build/adapters/nextjs.ts';
import { resetOutputDir } from '../../../../src/cmd/build/adapters/reset-output-dir.ts';

function makeDir(): string {
	const dir = join(
		tmpdir(),
		`next-standalone-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function touch(path: string, body = 'module.exports={}\n'): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body);
}

describe('resetOutputDir', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('removes stale files before recreate', () => {
		const dir = makeDir();
		dirs.push(dir);
		touch(join(dir, 'server.js'), 'stale');
		touch(join(dir, 'nested', 'server.js'), 'nested');
		resetOutputDir(dir);
		expect(existsSync(join(dir, 'server.js'))).toBe(false);
		expect(existsSync(join(dir, 'nested', 'server.js'))).toBe(false);
		expect(readdirSync(dir)).toEqual([]);
	});
});

describe('selectStandaloneServer', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('returns sole server.js', () => {
		const dir = makeDir();
		dirs.push(dir);
		const server = join(dir, 'server.js');
		touch(server);
		expect(selectStandaloneServer(dir)).toBe(server);
	});

	test('prefers project basename nest over stale root server.js', () => {
		const dir = makeDir();
		dirs.push(dir);
		const staleRoot = join(dir, 'server.js');
		const nested = join(dir, 'test-nextjs', 'server.js');
		touch(staleRoot, 'stale assetPrefix empty');
		touch(nested, 'cdn baked');
		// Without preference, root still wins when present (clean single-package).
		expect(selectStandaloneServer(dir)).toBe(staleRoot);
		// With project name preference (simulates basename(projectDir)).
		expect(selectStandaloneServer(dir, ['test-nextjs'])).toBe(nested);
	});

	test('prefers monorepo subpath over other nests', () => {
		const dir = makeDir();
		dirs.push(dir);
		const appsWeb = join(dir, 'apps', 'web', 'server.js');
		const other = join(dir, 'other', 'server.js');
		touch(appsWeb);
		touch(other);
		expect(selectStandaloneServer(dir, ['apps/web'])).toBe(appsWeb);
	});

	test('skips server.js under node_modules', () => {
		const dir = makeDir();
		dirs.push(dir);
		touch(join(dir, 'node_modules', 'next', 'dist', 'server.js'));
		const real = join(dir, 'server.js');
		touch(real);
		expect(listStandaloneServers(dir)).toEqual([real]);
		expect(selectStandaloneServer(dir)).toBe(real);
	});

	test('when only nested exists, returns nested', () => {
		const dir = makeDir();
		dirs.push(dir);
		const nested = join(dir, 'test-nextjs', 'server.js');
		touch(nested);
		expect(selectStandaloneServer(dir, ['test-nextjs'])).toBe(nested);
		expect(selectStandaloneServer(dir)).toBe(nested);
	});
});
