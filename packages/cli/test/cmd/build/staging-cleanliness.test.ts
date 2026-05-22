/**
 * Staging-area cleanliness tests.
 *
 * Two layers of defense keep the deploy zip from accidentally including
 * developer-machine clutter (huge `node_modules` trees, `.git/`, dev
 * env files, ssh keys):
 *
 *   1. `copyMonorepoTree` (the SDK's source-to-staging copy) skips a
 *      curated set of directories during the walk, so the staging dir
 *      never sees them in the first place.
 *
 *   2. `deployZipFilter` re-applies a smaller defensive net at zip
 *      time. The staging dir is SDK-controlled by then, so the filter
 *      only catches paths that are *always* unsafe to ship regardless
 *      of which adapter staged them (VCS, secrets, OS metadata).
 *
 * These tests pin both layers so a future "let me drop one of these
 * filters real quick" change doesn't silently leak hundreds of MB or,
 * worse, a `.env` file into a customer deploy.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyMonorepoTree } from '../../../src/cmd/build/adapters/generic';
import type { MonorepoContext } from '../../../src/cmd/build/detect/monorepo';
import { deployZipFilter } from '../../../src/cmd/cloud/deploy/upload';

function makeTmp(prefix: string): string {
	const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function write(path: string, content = ''): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, content);
}

const noopLogger = { debug: () => {} };

describe('copyMonorepoTree', () => {
	let root: string;
	let dst: string;

	beforeEach(() => {
		root = makeTmp('staging-src');
		dst = makeTmp('staging-dst');
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		rmSync(dst, { recursive: true, force: true });
	});

	function ctx(subpath = 'apps/web'): MonorepoContext {
		return { root, subpath, packageManager: 'npm' };
	}

	test("does not copy the user's node_modules at any depth", () => {
		// Root, subpackage, and deeply-nested node_modules. The fake
		// "bomb" file in each one would dwarf the real source tree on
		// disk; if the copy walks into it the test will notice via the
		// existence checks below.
		write(join(root, 'node_modules', 'react', 'package.json'), '{"name":"react"}');
		write(join(root, 'apps', 'web', 'node_modules', 'next', 'index.js'), '');
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'packages', 'shared', 'node_modules', 'lodash', 'index.js'), '');
		write(join(root, 'packages', 'shared', 'src', 'index.ts'), 'export {};');
		write(join(root, 'package.json'), '{"workspaces":["apps/*","packages/*"]}');

		copyMonorepoTree(ctx(), dst, noopLogger);

		// Source files survive.
		expect(existsSync(join(dst, 'package.json'))).toBe(true);
		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'packages/shared/src/index.ts'))).toBe(true);
		// node_modules anywhere does not.
		expect(existsSync(join(dst, 'node_modules'))).toBe(false);
		expect(existsSync(join(dst, 'apps/web/node_modules'))).toBe(false);
		expect(existsSync(join(dst, 'packages/shared/node_modules'))).toBe(false);
	});

	test('skips .git, .ssh, .vite, .DS_Store, and .agentuity', () => {
		write(join(root, '.git', 'HEAD'), 'ref: refs/heads/main');
		write(join(root, '.ssh', 'id_rsa'), 'SECRET');
		write(join(root, '.vite', 'cache.json'), '{}');
		write(join(root, '.DS_Store'), '');
		// A nested staging dir to make sure we don't recurse into ourselves.
		write(join(root, '.agentuity', 'stale.txt'), 'should be ignored');
		write(join(root, 'src', 'index.ts'), 'export {};');

		copyMonorepoTree(ctx(), dst, noopLogger);

		expect(existsSync(join(dst, 'src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, '.git'))).toBe(false);
		expect(existsSync(join(dst, '.ssh'))).toBe(false);
		expect(existsSync(join(dst, '.vite'))).toBe(false);
		expect(existsSync(join(dst, '.DS_Store'))).toBe(false);
		expect(existsSync(join(dst, '.agentuity'))).toBe(false);
	});

	test('skips every .env* variant at any depth', () => {
		write(join(root, '.env'), 'SECRET=1');
		write(join(root, '.env.local'), 'SECRET=2');
		write(join(root, '.env.production'), 'SECRET=3');
		write(join(root, 'apps', 'web', '.env'), 'SECRET=4');
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');

		copyMonorepoTree(ctx(), dst, noopLogger);

		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, '.env'))).toBe(false);
		expect(existsSync(join(dst, '.env.local'))).toBe(false);
		expect(existsSync(join(dst, '.env.production'))).toBe(false);
		expect(existsSync(join(dst, 'apps/web/.env'))).toBe(false);
	});

	test('copies build artifacts (dist/ inside the subpackage)', () => {
		write(join(root, 'apps', 'web', 'package.json'), '{}');
		write(join(root, 'apps', 'web', 'dist', 'index.cjs'), '// built');
		write(join(root, 'apps', 'web', 'dist', 'chunk-abc.js'), '');

		copyMonorepoTree(ctx(), dst, noopLogger);

		expect(existsSync(join(dst, 'apps/web/dist/index.cjs'))).toBe(true);
		expect(existsSync(join(dst, 'apps/web/dist/chunk-abc.js'))).toBe(true);
	});

	test('dereferences symlinks (so workspace-link targets ship as files)', () => {
		// `packages/shared/src/index.ts` is the real file; `apps/web/src/shared.ts`
		// is a symlink to it. We expect the symlink to be resolved to a
		// regular file copy in the staging tree.
		write(join(root, 'packages', 'shared', 'src', 'index.ts'), 'export const x = 1;');
		mkdirSync(join(root, 'apps', 'web', 'src'), { recursive: true });
		symlinkSync(
			join(root, 'packages', 'shared', 'src', 'index.ts'),
			join(root, 'apps', 'web', 'src', 'shared.ts')
		);

		copyMonorepoTree(ctx(), dst, noopLogger);

		const dstPath = join(dst, 'apps/web/src/shared.ts');
		expect(existsSync(dstPath)).toBe(true);
		expect(Bun.file(dstPath).text()).resolves.toBe('export const x = 1;');
	});

	test('skips the staging dir even when it sits inside the monorepo root', () => {
		// Realistic case: the SDK puts `.agentuity/` at the monorepo
		// root, so when copyMonorepoTree walks the root it must avoid
		// recursing into its own destination.
		const stagingInside = join(root, '.agentuity');
		mkdirSync(stagingInside, { recursive: true });
		write(join(stagingInside, 'old-build.txt'), 'previous run');
		write(join(root, 'src', 'index.ts'), 'export {};');

		copyMonorepoTree(ctx(), stagingInside, noopLogger);

		expect(existsSync(join(stagingInside, 'src/index.ts'))).toBe(true);
		// The pre-existing `old-build.txt` happens to share the dst
		// dir; we don't try to clean it, but we also don't recurse
		// into a `.agentuity/.agentuity/` infinite loop.
		expect(existsSync(join(stagingInside, '.agentuity'))).toBe(false);
	});
});

describe('deployZipFilter', () => {
	test('keeps source files', () => {
		expect(deployZipFilter('package.json', 'package.json')).toBe(true);
		expect(deployZipFilter('index.ts', 'apps/web/src/index.ts')).toBe(true);
		expect(deployZipFilter('launch.json', 'launch.json')).toBe(true);
	});

	test('keeps node_modules (Next.js standalone + future bundlers stage them deliberately)', () => {
		expect(deployZipFilter('next.js', 'node_modules/next/dist/next.js')).toBe(true);
		expect(deployZipFilter('package.json', 'apps/web/node_modules/react/package.json')).toBe(
			true
		);
	});

	test('drops .git, .ssh, .DS_Store, .agentuity at any depth', () => {
		expect(deployZipFilter('HEAD', '.git/HEAD')).toBe(false);
		expect(deployZipFilter('HEAD', 'apps/web/.git/HEAD')).toBe(false);
		expect(deployZipFilter('id_rsa', '.ssh/id_rsa')).toBe(false);
		expect(deployZipFilter('.DS_Store', '.DS_Store')).toBe(false);
		expect(deployZipFilter('.DS_Store', 'apps/web/.DS_Store')).toBe(false);
		expect(deployZipFilter('stale.json', '.agentuity/stale.json')).toBe(false);
		expect(deployZipFilter('stale.json', 'apps/web/.agentuity/stale.json')).toBe(false);
	});

	test('drops every .env* basename at any depth', () => {
		expect(deployZipFilter('.env', '.env')).toBe(false);
		expect(deployZipFilter('.env.local', '.env.local')).toBe(false);
		expect(deployZipFilter('.env.production', '.env.production')).toBe(false);
		expect(deployZipFilter('.env', 'apps/web/.env')).toBe(false);
		expect(deployZipFilter('.env.production', 'apps/web/.env.production')).toBe(false);
	});

	test('does NOT drop unrelated dotfiles', () => {
		// `.npmrc`, `.gitignore`, `.eslintrc` etc. are legitimate to ship
		// (or to expose to the deploy host). We only target the specific
		// shapes that contain secrets / per-machine state.
		expect(deployZipFilter('.npmrc', '.npmrc')).toBe(true);
		expect(deployZipFilter('.gitignore', '.gitignore')).toBe(true);
		expect(deployZipFilter('.eslintrc.json', '.eslintrc.json')).toBe(true);
	});
});
