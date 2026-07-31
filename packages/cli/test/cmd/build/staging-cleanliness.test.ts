/**
 * Staging-area cleanliness tests.
 *
 * Two layers of defense keep the deploy zip from accidentally including
 * developer-machine clutter:
 *
 *   1. `copyMonorepoTree` skips built-ins + `.agentuityignore` during staging.
 *   2. `deployZipFilter` re-applies a defensive net at zip time.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyMonorepoTree } from '../../../src/cmd/build/adapters/monorepo-stage';
import { resetOutputDir } from '../../../src/cmd/build/adapters/reset-output-dir';
import {
	ALWAYS_IGNORE_PATTERNS,
	DEPLOY_PACK_ZIP_BASENAME,
	deployZipFilter,
} from '../../../src/cmd/build/deploy-exclusions';
import {
	createDeployIgnoreMatcher,
	findRiskyBuildOutputIgnorePatterns,
	isProtectedStagingPath,
	loadDeployIgnoreMatcher,
	parseAgentuityIgnore,
} from '../../../src/cmd/build/deploy-ignore';
import type { MonorepoContext } from '../../../src/cmd/build/detect/monorepo';

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

describe('resetOutputDir (single-package staging hygiene)', () => {
	test('wipes prior package contents before recreate', () => {
		const dir = makeTmp('pkg-out');
		write(join(dir, 'stale-chunk.js'), 'old');
		write(join(dir, '_serve.js'), 'old-server');
		resetOutputDir(dir);
		expect(existsSync(join(dir, 'stale-chunk.js'))).toBe(false);
		expect(existsSync(join(dir, '_serve.js'))).toBe(false);
		expect(existsSync(dir)).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});
});

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
		write(join(root, 'node_modules', 'react', 'package.json'), '{"name":"react"}');
		write(join(root, 'apps', 'web', 'node_modules', 'next', 'index.js'), '');
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'packages', 'shared', 'node_modules', 'lodash', 'index.js'), '');
		write(join(root, 'packages', 'shared', 'src', 'index.ts'), 'export {};');
		write(join(root, 'package.json'), '{"workspaces":["apps/*","packages/*"]}');

		copyMonorepoTree(ctx(), dst, noopLogger);

		expect(existsSync(join(dst, 'package.json'))).toBe(true);
		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'packages/shared/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'node_modules'))).toBe(false);
		expect(existsSync(join(dst, 'apps/web/node_modules'))).toBe(false);
		expect(existsSync(join(dst, 'packages/shared/node_modules'))).toBe(false);
	});

	test('skips .git, .ssh, .vite, .DS_Store, and .agentuity', () => {
		write(join(root, '.git', 'HEAD'), 'ref: refs/heads/main');
		write(join(root, '.ssh', 'id_rsa'), 'SECRET');
		write(join(root, '.vite', 'cache.json'), '{}');
		write(join(root, '.DS_Store'), '');
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

	test('dereferences relative symlinks at repo root', () => {
		write(join(root, 'real.txt'), 'hello from symlink');
		symlinkSync('real.txt', join(root, 'link.txt'));
		write(join(root, 'package.json'), '{"workspaces":["apps/*"]}');

		copyMonorepoTree(ctx(), dst, noopLogger);

		const dstPath = join(dst, 'link.txt');
		expect(existsSync(dstPath)).toBe(true);
		expect(Bun.file(dstPath).text()).resolves.toBe('hello from symlink');
	});

	test('dereferences symlinks (so workspace-link targets ship as files)', () => {
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
		const stagingInside = join(root, '.agentuity');
		mkdirSync(stagingInside, { recursive: true });
		write(join(stagingInside, 'old-build.txt'), 'previous run');
		write(join(root, 'src', 'index.ts'), 'export {};');

		copyMonorepoTree(ctx(), stagingInside, noopLogger);

		expect(existsSync(join(stagingInside, 'src/index.ts'))).toBe(true);
		expect(existsSync(join(stagingInside, 'old-build.txt'))).toBe(false);
		expect(existsSync(join(stagingInside, '.agentuity'))).toBe(false);
	});

	test('wipes stale ignored paths from a previous staging run', () => {
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'experiments', 'a.ts'), 'export {};');
		copyMonorepoTree(ctx(), dst, noopLogger, { projectDir: join(root, 'apps', 'web') });
		expect(existsSync(join(dst, 'experiments/a.ts'))).toBe(true);

		write(join(root, 'apps', 'web', '.agentuityignore'), 'experiments\n');
		copyMonorepoTree(ctx(), dst, noopLogger, { projectDir: join(root, 'apps', 'web') });

		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'experiments'))).toBe(false);
	});

	test('honors .agentuityignore patterns from monorepo root', () => {
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'apps', 'mobile', 'src', 'index.ts'), 'export {};');
		write(join(root, 'docs', 'guide.md'), '# guide');
		write(join(root, 'packages', 'shared', 'src', 'index.ts'), 'export {};');
		write(join(root, '.agentuityignore'), ['apps/mobile/', 'docs/', '*.md'].join('\n'));

		copyMonorepoTree(ctx(), dst, noopLogger, { projectDir: join(root, 'apps', 'web') });

		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'packages/shared/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'apps/mobile'))).toBe(false);
		expect(existsSync(join(dst, 'docs'))).toBe(false);
	});

	test('project-local .agentuityignore patterns match monorepo-root paths', () => {
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'experiments', 'a.ts'), 'export {};');
		write(join(root, 'scripts', 'tool.ts'), 'export {};');
		write(join(root, '.agents', 'skill.md'), '# skill');
		write(
			join(root, 'apps', 'web', '.agentuityignore'),
			['.agents', 'experiments', 'scripts'].join('\n')
		);

		copyMonorepoTree(ctx(), dst, noopLogger, { projectDir: join(root, 'apps', 'web') });

		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'experiments'))).toBe(false);
		expect(existsSync(join(dst, 'scripts'))).toBe(false);
		expect(existsSync(join(dst, '.agents'))).toBe(false);
	});

	test('trace-logs each skipped path with reason (.agentuityignore vs built-in)', () => {
		const traces: string[] = [];
		const debugs: string[] = [];
		const logger = {
			debug: (msg: unknown) => {
				debugs.push(String(msg));
			},
			trace: (msg: unknown) => {
				traces.push(String(msg));
			},
		};

		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'docs', 'guide.md'), '# guide');
		write(join(root, 'node_modules', 'left-pad', 'index.js'), 'module.exports=1');
		write(join(root, '.agentuityignore'), 'docs/\n');

		copyMonorepoTree(ctx(), dst, logger, { projectDir: join(root, 'apps', 'web') });

		expect(traces.some((t) => t.includes('patterns (1): docs/'))).toBe(true);
		expect(
			traces.some((t) => t.includes('skipping directory docs') && t.includes('.agentuityignore'))
		).toBe(true);
		expect(
			traces.some((t) => t.includes('skipping directory node_modules') && t.includes('built-in'))
		).toBe(true);
		expect(debugs.some((t) => t.includes('Deploy ignore summary:'))).toBe(true);
		expect(traces.some((t) => t.includes('apps/web/src/index.ts'))).toBe(false);
	});

	test('merges project-local .agentuityignore with monorepo root file', () => {
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'apps', 'web', 'fixtures', 'sample.json'), '{}');
		write(join(root, 'docs', 'guide.md'), '# guide');
		write(join(root, '.agentuityignore'), 'docs/\n');
		write(join(root, 'apps', 'web', '.agentuityignore'), 'apps/web/fixtures/\n');

		copyMonorepoTree(ctx(), dst, noopLogger, { projectDir: join(root, 'apps', 'web') });

		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'docs'))).toBe(false);
		expect(existsSync(join(dst, 'apps/web/fixtures'))).toBe(false);
	});

	test('built-in safety skips cannot be re-included via negation', () => {
		write(join(root, 'node_modules', 'left-pad', 'index.js'), 'module.exports=1');
		write(join(root, '.env'), 'SECRET=1');
		write(join(root, 'src', 'index.ts'), 'export {};');
		write(
			join(root, '.agentuityignore'),
			['!node_modules', '!.env', '!node_modules/**'].join('\n')
		);

		copyMonorepoTree(ctx(), dst, noopLogger);

		expect(existsSync(join(dst, 'src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'node_modules'))).toBe(false);
		expect(existsSync(join(dst, '.env'))).toBe(false);
	});

	test('keeps target package build output when bare dist/ is ignored', () => {
		// Regression: gitignore `dist/` matches any path segment named dist,
		// including apps/web/dist (the package's Vite/TS build artifacts).
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'apps', 'web', 'dist', 'server.js'), '// built');
		write(join(root, 'apps', 'web', 'dist', 'chunk.js'), '');
		write(join(root, 'dist', 'docs', 'index.html'), '<html>');
		write(join(root, 'package.json'), '{"workspaces":["apps/*"]}');
		write(join(root, '.agentuityignore'), 'dist/\n');

		const warns: string[] = [];
		const logger = {
			debug: () => {},
			warn: (msg: unknown) => {
				warns.push(String(msg));
			},
		};

		const stats = copyMonorepoTree(ctx(), dst, logger, {
			projectDir: join(root, 'apps', 'web'),
			buildOutput: 'dist',
		});

		expect(existsSync(join(dst, 'apps/web/dist/server.js'))).toBe(true);
		expect(existsSync(join(dst, 'apps/web/dist/chunk.js'))).toBe(true);
		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
		expect(existsSync(join(dst, 'dist'))).toBe(false);
		expect(stats.protectedKept).toBeGreaterThan(0);
		expect(warns.some((w) => w.includes('apps/web/dist') || w.includes('protected'))).toBe(true);
	});

	test('still skips node_modules under the target package (built-in wins)', () => {
		write(join(root, 'apps', 'web', 'dist', 'server.js'), '// built');
		write(join(root, 'apps', 'web', 'node_modules', 'left-pad', 'index.js'), '1');
		write(join(root, 'package.json'), '{"workspaces":["apps/*"]}');

		copyMonorepoTree(ctx(), dst, noopLogger, {
			projectDir: join(root, 'apps', 'web'),
			buildOutput: 'dist',
		});

		expect(existsSync(join(dst, 'apps/web/dist/server.js'))).toBe(true);
		expect(existsSync(join(dst, 'apps/web/node_modules'))).toBe(false);
	});

	test('recurses symlink-to-directory so ignore rules apply to nested paths', () => {
		write(join(root, 'real-docs', 'guide.md'), '# guide');
		write(join(root, 'real-docs', 'secret.env.local'), 'x=1'); // not a .env. basename segment
		write(join(root, 'apps', 'web', 'src', 'index.ts'), 'export {};');
		write(join(root, 'package.json'), '{"workspaces":["apps/*"]}');
		// Symlink at monorepo root named `docs` → real-docs tree.
		symlinkSync(join(root, 'real-docs'), join(root, 'docs'));
		write(join(root, '.agentuityignore'), 'docs/\n');

		copyMonorepoTree(ctx(), dst, noopLogger, {
			projectDir: join(root, 'apps', 'web'),
			buildOutput: 'dist',
		});

		// The symlink directory itself is ignored via .agentuityignore.
		expect(existsSync(join(dst, 'docs'))).toBe(false);
		expect(existsSync(join(dst, 'apps/web/src/index.ts'))).toBe(true);
	});
});

describe('parseAgentuityIgnore / deploy ignore matcher', () => {
	test('parseAgentuityIgnore drops comments and blanks', () => {
		const patterns = parseAgentuityIgnore(
			['# header', '', 'docs/', '  apps/mobile/  ', '# trail'].join('\n')
		);
		expect(patterns).toEqual(['docs/', 'apps/mobile/']);
	});

	test('createDeployIgnoreMatcher matches gitignore directory patterns', () => {
		const matcher = createDeployIgnoreMatcher({
			userPatterns: ['docs/', 'apps/mobile', '**/*.test.ts'],
		});
		expect(matcher.classify('docs', true)).toBe('agentuityignore');
		expect(matcher.classify('docs/guide.md')).toBe('agentuityignore');
		expect(matcher.classify('apps/mobile', true)).toBe('agentuityignore');
		expect(matcher.classify('apps/web/src/index.ts')).toBe(null);
		expect(matcher.classify('apps/web/src/index.test.ts')).toBe('agentuityignore');
	});

	test('classify attributes built-in vs .agentuityignore skips', () => {
		const matcher = createDeployIgnoreMatcher({
			userPatterns: ['docs/'],
			sources: ['/tmp/.agentuityignore'],
			builtInPatterns: ALWAYS_IGNORE_PATTERNS,
		});
		expect(matcher.classify('docs', true)).toBe('agentuityignore');
		expect(matcher.classify('docs/guide.md')).toBe('agentuityignore');
		expect(matcher.classify('node_modules', true)).toBe('built-in');
		expect(matcher.classify('.env.local')).toBe('built-in');
		expect(matcher.classify('apps/web/src/index.ts')).toBe(null);
	});

	test('loadDeployIgnoreMatcher reads monorepo root file', () => {
		const root = join(
			tmpdir(),
			`ignore-load-${Date.now()}-${Math.random().toString(36).slice(2)}`
		);
		mkdirSync(root, { recursive: true });
		try {
			writeFileSync(join(root, '.agentuityignore'), 'docs/\n.github/\n');
			const matcher = loadDeployIgnoreMatcher(root);
			expect(matcher.sources).toHaveLength(1);
			expect(matcher.userPatterns).toEqual(['docs/', '.github/']);
			expect(matcher.classify('docs/readme.md')).toBe('agentuityignore');
			expect(matcher.classify('.github/workflows/ci.yml')).toBe('agentuityignore');
			expect(matcher.classify('apps/web/src/index.ts')).toBe(null);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('isProtectedStagingPath covers package build output and root manifests', () => {
		const protect = { subpath: 'apps/web', buildOutput: 'dist' };
		expect(isProtectedStagingPath('package.json', protect)).toBe(true);
		expect(isProtectedStagingPath('bun.lock', protect)).toBe(true);
		expect(isProtectedStagingPath('apps/web', protect)).toBe(true);
		expect(isProtectedStagingPath('apps/web/package.json', protect)).toBe(true);
		expect(isProtectedStagingPath('apps/web/dist', protect)).toBe(true);
		expect(isProtectedStagingPath('apps/web/dist/server.js', protect)).toBe(true);
		expect(isProtectedStagingPath('dist', protect)).toBe(false);
		expect(isProtectedStagingPath('dist/docs', protect)).toBe(false);
		expect(isProtectedStagingPath('apps/web/src/index.ts', protect)).toBe(false);
	});

	test('findRiskyBuildOutputIgnorePatterns flags bare build-output names', () => {
		expect(findRiskyBuildOutputIgnorePatterns(['dist/', 'docs/', '**/dist'], 'dist')).toEqual([
			'dist/',
			'**/dist',
		]);
		expect(findRiskyBuildOutputIgnorePatterns(['apps/other/dist/'], 'dist')).toEqual([]);
	});
});

describe('deployZipFilter', () => {
	test('keeps source files', () => {
		expect(deployZipFilter('package.json', 'package.json')).toBe(true);
		expect(deployZipFilter('index.ts', 'apps/web/src/index.ts')).toBe(true);
		expect(deployZipFilter('launch.json', 'launch.json')).toBe(true);
	});

	test('keeps node_modules (Next.js standalone stages them deliberately)', () => {
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

	test('drops every .env / .env.<suffix> basename at any depth', () => {
		expect(deployZipFilter('.env', '.env')).toBe(false);
		expect(deployZipFilter('.env.local', '.env.local')).toBe(false);
		expect(deployZipFilter('.env.production', '.env.production')).toBe(false);
		expect(deployZipFilter('.env', 'apps/web/.env')).toBe(false);
		expect(deployZipFilter('.env.production', 'apps/web/.env.production')).toBe(false);
		// Boundary-aware: not a prefix match on unrelated names.
		expect(deployZipFilter('.envrc', '.envrc')).toBe(true);
		expect(deployZipFilter('.environment', '.environment')).toBe(true);
	});

	test('drops .vite basename at any depth (aligned with ALWAYS_SKIP_BASENAMES)', () => {
		expect(deployZipFilter('cache.json', '.vite/cache.json')).toBe(false);
		expect(deployZipFilter('cache.json', 'apps/web/.vite/cache.json')).toBe(false);
	});

	test('does NOT drop unrelated dotfiles', () => {
		expect(deployZipFilter('.npmrc', '.npmrc')).toBe(true);
		expect(deployZipFilter('.gitignore', '.gitignore')).toBe(true);
		expect(deployZipFilter('.eslintrc.json', '.eslintrc.json')).toBe(true);
	});

	test('drops pack-only artifact basename', () => {
		expect(deployZipFilter(DEPLOY_PACK_ZIP_BASENAME, DEPLOY_PACK_ZIP_BASENAME)).toBe(false);
		expect(
			deployZipFilter(DEPLOY_PACK_ZIP_BASENAME, `apps/web/${DEPLOY_PACK_ZIP_BASENAME}`)
		).toBe(false);
	});
});
