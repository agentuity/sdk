import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { selectStandaloneServer } from '../../../../src/cmd/build/adapters/nextjs.ts';

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

describe('selectStandaloneServer', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
		dirs.length = 0;
	});

	test('returns sole server.js at root', () => {
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

	test('prefers monorepo subpath over other nests and root', () => {
		const dir = makeDir();
		dirs.push(dir);
		const root = join(dir, 'server.js');
		const appsWeb = join(dir, 'apps', 'web', 'server.js');
		const other = join(dir, 'other', 'server.js');
		touch(root, 'stale');
		touch(appsWeb);
		touch(other);
		expect(selectStandaloneServer(dir, ['apps/web'])).toBe(appsWeb);
		// First preferred dir wins when multiple are supplied.
		expect(selectStandaloneServer(dir, ['apps/web', 'other'])).toBe(appsWeb);
		expect(selectStandaloneServer(dir, ['other', 'apps/web'])).toBe(other);
	});

	test('skips server.js under node_modules', () => {
		const dir = makeDir();
		dirs.push(dir);
		touch(join(dir, 'node_modules', 'next', 'dist', 'server.js'));
		const real = join(dir, 'server.js');
		touch(real);
		expect(selectStandaloneServer(dir)).toBe(real);
	});

	test('skips server.js under .git', () => {
		const dir = makeDir();
		dirs.push(dir);
		touch(join(dir, '.git', 'hooks', 'server.js'));
		const nested = join(dir, 'app', 'server.js');
		touch(nested);
		expect(selectStandaloneServer(dir)).toBe(nested);
	});

	test('when only nested exists, returns nested without preference', () => {
		const dir = makeDir();
		dirs.push(dir);
		const nested = join(dir, 'test-nextjs', 'server.js');
		touch(nested);
		expect(selectStandaloneServer(dir, ['test-nextjs'])).toBe(nested);
		expect(selectStandaloneServer(dir)).toBe(nested);
	});

	test('ignores empty / . / .. preferred dirs', () => {
		const dir = makeDir();
		dirs.push(dir);
		const nested = join(dir, 'app', 'server.js');
		touch(nested);
		expect(selectStandaloneServer(dir, ['', '.', '..', 'app'])).toBe(nested);
	});

	test('preferred path with trailing slash still matches', () => {
		const dir = makeDir();
		dirs.push(dir);
		const nested = join(dir, 'apps', 'web', 'server.js');
		touch(nested);
		expect(selectStandaloneServer(dir, ['apps/web/'])).toBe(nested);
	});

	test('returns null when no server.js exists', () => {
		const dir = makeDir();
		dirs.push(dir);
		mkdirSync(join(dir, 'empty'), { recursive: true });
		expect(selectStandaloneServer(dir)).toBeNull();
		expect(selectStandaloneServer(dir, ['missing'])).toBeNull();
	});

	test('does not treat a directory named server.js as the entry', () => {
		const dir = makeDir();
		dirs.push(dir);
		mkdirSync(join(dir, 'server.js'), { recursive: true });
		const nested = join(dir, 'app', 'server.js');
		touch(nested);
		expect(selectStandaloneServer(dir)).toBe(nested);
	});
});
