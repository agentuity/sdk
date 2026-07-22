import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectMonorepoContext } from '../../../../src/cmd/build/detect/monorepo';

function makeTmp(): string {
	const dir = join(
		tmpdir(),
		`monorepo-detect-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writeJson(path: string, content: unknown): void {
	writeFileSync(path, JSON.stringify(content, null, 2));
}

describe('detectMonorepoContext', () => {
	let root: string;

	beforeEach(() => {
		root = makeTmp();
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('returns null when there is no enclosing workspace', async () => {
		const projectDir = join(root, 'standalone-app');
		mkdirSync(projectDir);
		writeJson(join(projectDir, 'package.json'), { name: 'app' });

		const ctx = await detectMonorepoContext(projectDir);
		expect(ctx).toBeNull();
	});

	test('returns null when invoked at the monorepo root itself', async () => {
		writeJson(join(root, 'package.json'), {
			name: 'mono',
			private: true,
			workspaces: ['apps/*'],
		});

		const ctx = await detectMonorepoContext(root);
		expect(ctx).toBeNull();
	});

	test('detects npm-style workspaces via package.json:workspaces array', async () => {
		writeJson(join(root, 'package.json'), {
			name: 'mono',
			private: true,
			workspaces: ['apps/*', 'packages/*'],
		});
		writeFileSync(join(root, 'package-lock.json'), '{}');
		const appDir = join(root, 'apps', 'web');
		mkdirSync(appDir, { recursive: true });
		writeJson(join(appDir, 'package.json'), { name: '@x/web' });

		const ctx = await detectMonorepoContext(appDir);
		expect(ctx).not.toBeNull();
		expect(ctx!.root).toBe(root);
		expect(ctx!.subpath).toBe('apps/web');
		expect(ctx!.packageManager).toBe('npm');
	});

	test('detects yarn-classic workspaces via { packages: [...] } shape', async () => {
		writeJson(join(root, 'package.json'), {
			name: 'mono',
			private: true,
			workspaces: { packages: ['apps/*'] },
		});
		writeFileSync(join(root, 'yarn.lock'), '');
		const appDir = join(root, 'apps', 'web');
		mkdirSync(appDir, { recursive: true });
		writeJson(join(appDir, 'package.json'), { name: '@x/web' });

		const ctx = await detectMonorepoContext(appDir);
		expect(ctx).not.toBeNull();
		expect(ctx!.packageManager).toBe('yarn');
		expect(ctx!.subpath).toBe('apps/web');
	});

	test('detects bun workspaces by bun.lock at the workspace root', async () => {
		writeJson(join(root, 'package.json'), {
			name: 'mono',
			private: true,
			workspaces: ['apps/*'],
		});
		writeFileSync(join(root, 'bun.lock'), '');
		const appDir = join(root, 'apps', 'web');
		mkdirSync(appDir, { recursive: true });
		writeJson(join(appDir, 'package.json'), { name: '@x/web' });

		const ctx = await detectMonorepoContext(appDir);
		expect(ctx!.packageManager).toBe('bun');
	});

	test('detects pnpm workspaces via pnpm-workspace.yaml regardless of package.json shape', async () => {
		writeJson(join(root, 'package.json'), { name: 'mono', private: true });
		writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
		const appDir = join(root, 'apps', 'web');
		mkdirSync(appDir, { recursive: true });
		writeJson(join(appDir, 'package.json'), { name: '@x/web' });

		const ctx = await detectMonorepoContext(appDir);
		expect(ctx!.packageManager).toBe('pnpm');
		expect(ctx!.subpath).toBe('apps/web');
	});

	test('walks multiple levels up to find the workspace root', async () => {
		writeJson(join(root, 'package.json'), {
			name: 'mono',
			private: true,
			workspaces: ['apps/**'],
		});
		const deep = join(root, 'apps', 'group-a', 'web');
		mkdirSync(deep, { recursive: true });
		writeJson(join(deep, 'package.json'), { name: '@x/web' });

		const ctx = await detectMonorepoContext(deep);
		expect(ctx!.root).toBe(root);
		expect(ctx!.subpath).toBe('apps/group-a/web');
	});

	test('pnpm marker wins over npm-style marker further up', async () => {
		// Outer npm workspace
		writeJson(join(root, 'package.json'), {
			name: 'outer',
			private: true,
			workspaces: ['inner/*'],
		});
		// Inner pnpm workspace
		const innerRoot = join(root, 'inner', 'mono');
		mkdirSync(innerRoot, { recursive: true });
		writeJson(join(innerRoot, 'package.json'), { name: 'inner-mono', private: true });
		writeFileSync(join(innerRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
		const appDir = join(innerRoot, 'apps', 'web');
		mkdirSync(appDir, { recursive: true });
		writeJson(join(appDir, 'package.json'), { name: '@x/web' });

		const ctx = await detectMonorepoContext(appDir);
		expect(ctx!.root).toBe(innerRoot);
		expect(ctx!.packageManager).toBe('pnpm');
		expect(ctx!.subpath).toBe('apps/web');
	});

	test('ignores package.json files without a workspaces field while walking', async () => {
		// Intermediate dir has its own package.json (not a workspace root).
		const intermediate = join(root, 'apps');
		mkdirSync(intermediate, { recursive: true });
		writeJson(join(intermediate, 'package.json'), { name: 'apps-grouping' });

		// Real workspace root is one level up.
		writeJson(join(root, 'package.json'), {
			name: 'mono',
			private: true,
			workspaces: ['apps/*'],
		});

		const appDir = join(intermediate, 'web');
		mkdirSync(appDir, { recursive: true });
		writeJson(join(appDir, 'package.json'), { name: '@x/web' });

		const ctx = await detectMonorepoContext(appDir);
		expect(ctx!.root).toBe(root);
		expect(ctx!.subpath).toBe('apps/web');
	});

	test('handles a malformed package.json by skipping it', async () => {
		writeFileSync(join(root, 'package.json'), '{ not valid json');
		writeJson(join(root, '..', 'should-not-be-read.json'), { ignore: true });
		// No workspace root anywhere up the chain; result should be null.
		const ctx = await detectMonorepoContext(root);
		expect(ctx).toBeNull();
	});

	test('returns null for directories under a monorepo that are not workspace members', async () => {
		// Mirrors WSL CI: smoke apps are created as siblings of packages/, not
		// listed in workspaces — they must not trigger monorepo packaging.
		writeJson(join(root, 'package.json'), {
			name: 'mono',
			private: true,
			workspaces: ['packages/*', 'apps/*'],
		});
		writeFileSync(join(root, 'bun.lock'), '');
		const smokeDir = join(root, 'test-wsl-123-1');
		mkdirSync(smokeDir, { recursive: true });
		writeJson(join(smokeDir, 'package.json'), { name: 'smoke-app' });

		const ctx = await detectMonorepoContext(smokeDir);
		expect(ctx).toBeNull();
	});

	test('still detects real workspace members under packages/*', async () => {
		writeJson(join(root, 'package.json'), {
			name: 'mono',
			private: true,
			workspaces: ['packages/*'],
		});
		writeFileSync(join(root, 'bun.lock'), '');
		const pkgDir = join(root, 'packages', 'cli');
		mkdirSync(pkgDir, { recursive: true });
		writeJson(join(pkgDir, 'package.json'), { name: '@x/cli' });

		const ctx = await detectMonorepoContext(pkgDir);
		expect(ctx).not.toBeNull();
		expect(ctx!.subpath).toBe('packages/cli');
	});
});
