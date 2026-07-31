import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	generateLaunchMetadata,
	LaunchConfigError,
	readUserLaunchOverride,
	writeLaunchMetadata,
} from '../../../../src/cmd/build/package/launch';
import { packageBuildOutput } from '../../../../src/cmd/build/package';
import type { DetectedFramework } from '../../../../src/cmd/build/detect/types';
import type { BuildResult } from '../../../../src/cmd/build/adapters/types';

function createTestDir(): string {
	const dir = join(tmpdir(), `launch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe('Launch Metadata', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	// ── generateLaunchMetadata ──

	describe('generateLaunchMetadata', () => {
		test('generates web process from server framework', () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				version: '15.3.0',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node .next/standalone/server.js',
				port: 3000,
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node server.js',
				port: 3000,
				duration: 5000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);

			expect(metadata.processes).toHaveLength(1);
			expect(metadata.processes[0].type).toBe('web');
			expect(metadata.processes[0].command).toBe('node server.js');
			expect(metadata.processes[0].default).toBe(true);
			expect(metadata.framework.name).toBe('nextjs');
			expect(metadata.framework.version).toBe('15.3.0');
			expect(metadata.runtime.name).toBe('node');
			expect(metadata.runtime.port).toBe(3000);
		});

		test('uses buildResult.startCommand over framework.startCommand', () => {
			const framework: DetectedFramework = {
				name: 'generic',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'tsc',
				buildOutput: 'dist',
				startCommand: 'node dist/index.js',
				confidence: 'low',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node dist/server.js', // Different from framework
				duration: 1000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.processes[0].command).toBe('node dist/server.js');
		});

		test('falls back to framework.startCommand when buildResult has none', () => {
			const framework: DetectedFramework = {
				name: 'nuxt',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'nuxt build',
				buildOutput: '.output',
				startCommand: 'node .output/server/index.mjs',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				duration: 3000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.processes[0].command).toBe('node .output/server/index.mjs');
		});

		test('no processes for static-only build with no start command', () => {
			const framework: DetectedFramework = {
				name: 'vite',
				runtime: 'node',
				packageManager: 'bun',
				buildCommand: 'vite build',
				buildOutput: 'dist',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				duration: 2000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.processes).toHaveLength(0);
		});

		test('includes build duration', () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node server.js',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node server.js',
				duration: 12345,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.build.duration).toBe(12345);
			expect(metadata.build.date).toBeTruthy();
		});

		test('uses buildResult.port over framework.port', () => {
			const framework: DetectedFramework = {
				name: 'astro',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'astro build',
				buildOutput: 'dist',
				startCommand: 'node dist/server/entry.mjs',
				port: 4321,
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node dist/server/entry.mjs',
				port: 8080,
				duration: 3000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.runtime.port).toBe(8080);
		});

		test('includes static directory and publicPath from build result', () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node server.js',
				staticDir: '.next/static',
				staticAssetPublicPath: '_next/static',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node server.js',
				staticDir: '/tmp/output/.next/static',
				staticAssetPublicPath: '_next/static',
				duration: 1000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.static).toEqual({
				directory: '.next/static',
				publicPath: '_next/static',
			});
		});

		test('records cdn baseUrl on static when provided', () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node server.js',
				staticDir: '.next/static',
				staticAssetPublicPath: '_next/static',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node server.js',
				staticDir: '/tmp/output/.next/static',
				staticAssetPublicPath: '_next/static',
				duration: 1000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(
				framework,
				buildResult,
				null,
				undefined,
				'https://cdn.agentuity.com/org_123/assets/'
			);
			expect(metadata.static).toEqual({
				directory: '.next/static',
				publicPath: '_next/static',
				baseUrl: 'https://cdn.agentuity.com/org_123/assets/',
			});
		});

		test('omits static when framework has no static dir', () => {
			const framework: DetectedFramework = {
				name: 'nestjs',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'nest build',
				buildOutput: 'dist',
				startCommand: 'node dist/main.js',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node dist/main.js',
				duration: 500,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.static).toBeUndefined();
		});

		test('static directory is relative to monorepo workingDirectory', () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				runtime: 'node',
				packageManager: 'pnpm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node server.js',
				staticDir: '.next/static',
				staticAssetPublicPath: '_next/static',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node server.js',
				staticDir: '/tmp/output/apps/web/.next/static',
				staticAssetPublicPath: '_next/static',
				duration: 1000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult, null, {
				root: '/tmp/repo',
				subpath: 'apps/web',
				packageManager: 'pnpm',
			});
			expect(metadata.static?.directory).toBe('.next/static');
			expect(metadata.processes[0].workingDirectory).toBe('apps/web');
		});

		test('uses buildResult.workingDirectory for nested Next standalone', () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node server.js',
				staticDir: '.next/static',
				staticAssetPublicPath: '_next/static',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node server.js',
				serverEntry: 'server.js',
				workingDirectory: 'test-nextjs',
				staticDir: '/tmp/output/test-nextjs/.next/static',
				staticAssetPublicPath: '_next/static',
				duration: 1000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.processes[0].command).toBe('node server.js');
			expect(metadata.processes[0].workingDirectory).toBe('test-nextjs');
			expect(metadata.static?.directory).toBe('.next/static');
			expect(metadata.static?.publicPath).toBe('_next/static');
		});

		test('adapter workingDirectory takes precedence over monorepo.subpath', () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				runtime: 'node',
				packageManager: 'pnpm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node server.js',
				staticDir: '.next/static',
				staticAssetPublicPath: '_next/static',
				confidence: 'high',
			};

			// Packaging discovered server.js under a nest that differs from
			// monorepo.subpath (e.g. outputFileTracingRoot layout correction).
			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node server.js',
				serverEntry: 'server.js',
				workingDirectory: 'apps/web',
				staticDir: '/tmp/output/apps/web/.next/static',
				staticAssetPublicPath: '_next/static',
				duration: 1000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult, null, {
				root: '/tmp/repo',
				// Intentionally different — must not override adapter layout.
				subpath: 'packages/wrong',
				packageManager: 'pnpm',
			});
			expect(metadata.processes[0].workingDirectory).toBe('apps/web');
			expect(metadata.static?.directory).toBe('.next/static');
		});

		test('falls back to monorepo.subpath when adapter leaves workingDirectory unset', () => {
			const framework: DetectedFramework = {
				name: 'vite',
				runtime: 'node',
				packageManager: 'pnpm',
				buildCommand: 'vite build',
				buildOutput: 'dist',
				startCommand: 'node dist/server.js',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'node dist/server.js',
				duration: 500,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult, null, {
				root: '/tmp/repo',
				subpath: 'apps/web',
				packageManager: 'pnpm',
			});
			expect(metadata.processes[0].workingDirectory).toBe('apps/web');
		});

		test('runtime is node when start command is HOST=… node …', () => {
			const framework: DetectedFramework = {
				name: 'nuxt',
				runtime: 'bun', // lockfile would have said bun
				packageManager: 'bun',
				buildCommand: 'nuxt build',
				buildOutput: '.output',
				startCommand: 'HOST=0.0.0.0 node .output/server/index.mjs',
				staticDir: '.output/public',
				staticAssetPublicPath: '',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				startCommand: 'HOST=0.0.0.0 node .output/server/index.mjs',
				staticDir: '/tmp/output/.output/public',
				staticAssetPublicPath: '',
				duration: 1000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(framework, buildResult);
			expect(metadata.runtime.name).toBe('node');
		});

		test('user override can replace static block', () => {
			const framework: DetectedFramework = {
				name: 'vite',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'vite build',
				buildOutput: 'dist',
				staticDir: 'dist',
				staticAssetPublicPath: '',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: '/tmp/output',
				staticDir: '/tmp/output/dist',
				staticAssetPublicPath: '',
				duration: 1000,
				logs: [],
			};

			const metadata = generateLaunchMetadata(
				framework,
				buildResult,
				{
					static: {
						directory: 'public',
						publicPath: 'assets',
						baseUrl: 'https://cdn.example.com/x/',
					},
				},
				undefined,
				'https://cdn.agentuity.com/' // should not clobber user baseUrl
			);
			expect(metadata.static).toEqual({
				directory: 'public',
				publicPath: 'assets',
				baseUrl: 'https://cdn.example.com/x/',
			});
		});
	});

	// ── writeLaunchMetadata ──

	describe('writeLaunchMetadata', () => {
		test('writes launch.json', () => {
			const metadata = generateLaunchMetadata(
				{
					name: 'nextjs',
					runtime: 'node',
					packageManager: 'npm',
					buildCommand: 'next build',
					buildOutput: '.next',
					startCommand: 'node server.js',
					confidence: 'high',
				},
				{
					outputDir: testDir,
					startCommand: 'node server.js',
					duration: 1000,
					logs: [],
				}
			);

			writeLaunchMetadata(testDir, metadata);

			const launchPath = join(testDir, 'launch.json');
			expect(existsSync(launchPath)).toBe(true);

			const parsed = JSON.parse(readFileSync(launchPath, 'utf-8'));
			expect(parsed.processes[0].type).toBe('web');
			expect(parsed.processes[0].command).toBe('node server.js');
			expect(parsed.framework.name).toBe('nextjs');
		});

		test('creates output directory if missing', () => {
			const subDir = join(testDir, 'nested', 'dir');
			const metadata = generateLaunchMetadata(
				{
					name: 'generic',
					runtime: 'node',
					packageManager: 'npm',
					buildCommand: 'tsc',
					buildOutput: 'dist',
					startCommand: 'node dist/index.js',
					confidence: 'low',
				},
				{
					outputDir: subDir,
					startCommand: 'node dist/index.js',
					duration: 500,
					logs: [],
				}
			);

			writeLaunchMetadata(subDir, metadata);
			expect(existsSync(join(subDir, 'launch.json'))).toBe(true);
		});
	});

	// ── packageBuildOutput ──

	describe('packageBuildOutput', () => {
		test('returns hasStaticAssets when staticDir exists', async () => {
			const staticDir = join(testDir, 'static');
			mkdirSync(staticDir, { recursive: true });

			const framework: DetectedFramework = {
				name: 'nextjs',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node server.js',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: testDir,
				startCommand: 'node server.js',
				staticDir,
				duration: 3000,
				logs: [],
			};

			const result = await packageBuildOutput(framework, buildResult, testDir);
			expect(result.hasStaticAssets).toBe(true);
			expect(result.staticDir).toBe(staticDir);
		});

		test('returns hasStaticAssets false when no static dir', async () => {
			const framework: DetectedFramework = {
				name: 'generic',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'tsc',
				buildOutput: 'dist',
				startCommand: 'node dist/index.js',
				confidence: 'low',
			};

			const buildResult: BuildResult = {
				outputDir: testDir,
				startCommand: 'node dist/index.js',
				duration: 1000,
				logs: [],
			};

			const result = await packageBuildOutput(framework, buildResult, testDir);
			expect(result.hasStaticAssets).toBe(false);
		});

		test('user override at projectDir replaces processes and runtime fields', async () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				runtime: 'node',
				packageManager: 'npm',
				buildCommand: 'next build',
				buildOutput: '.next',
				startCommand: 'node server.js',
				confidence: 'high',
			};
			const buildResult: BuildResult = {
				outputDir: testDir,
				startCommand: 'node server.js',
				duration: 2000,
				logs: [],
			};

			writeFileSync(
				join(testDir, 'launch.json'),
				JSON.stringify({
					processes: [
						{ type: 'web', command: 'bun run start', default: true },
						{ type: 'worker', command: 'bun run worker', default: false },
					],
					runtime: { name: 'bun', port: 8080 },
				})
			);

			await packageBuildOutput(framework, buildResult, testDir, testDir);

			const parsed = JSON.parse(readFileSync(join(testDir, 'launch.json'), 'utf-8'));
			expect(parsed.processes).toHaveLength(2);
			expect(parsed.processes[0].command).toBe('bun run start');
			expect(parsed.processes[1].type).toBe('worker');
			expect(parsed.runtime.name).toBe('bun');
			expect(parsed.runtime.port).toBe(8080);
			// Build metadata is always machine-generated.
			expect(typeof parsed.build.date).toBe('string');
			expect(parsed.build.duration).toBe(2000);
		});

		test('writes launch metadata output files', async () => {
			const framework: DetectedFramework = {
				name: 'sveltekit',
				runtime: 'node',
				packageManager: 'pnpm',
				buildCommand: 'vite build',
				buildOutput: 'build',
				startCommand: 'node build/index.js',
				confidence: 'high',
			};

			const buildResult: BuildResult = {
				outputDir: testDir,
				startCommand: 'node build/index.js',
				duration: 4000,
				logs: [],
			};

			await packageBuildOutput(framework, buildResult, testDir);

			expect(existsSync(join(testDir, 'launch.json'))).toBe(true);
		});
	});

	// ── readUserLaunchOverride ──

	describe('readUserLaunchOverride', () => {
		test('returns null when no launch.json present', async () => {
			expect(await readUserLaunchOverride(testDir)).toBeNull();
		});

		test('parses a partial override', async () => {
			writeFileSync(join(testDir, 'launch.json'), JSON.stringify({ runtime: { name: 'bun' } }));
			const result = await readUserLaunchOverride(testDir);
			expect(result?.runtime?.name).toBe('bun');
		});

		test('throws on invalid JSON', async () => {
			writeFileSync(join(testDir, 'launch.json'), '{ not json');
			await expect(readUserLaunchOverride(testDir)).rejects.toThrow(/Invalid launch\.json/);
		});

		test('treats JSON null on optional top-level fields as absent, matching pre-Zod `?.` semantics', async () => {
			writeFileSync(
				join(testDir, 'launch.json'),
				JSON.stringify({ processes: null, runtime: null })
			);
			const result = await readUserLaunchOverride(testDir);
			expect(result?.processes).toBeUndefined();
			expect(result?.runtime).toBeUndefined();
		});

		test('treats JSON null on a nested optional field (runtime.port) as absent', async () => {
			writeFileSync(
				join(testDir, 'launch.json'),
				JSON.stringify({ runtime: { name: 'bun', port: null } })
			);
			const result = await readUserLaunchOverride(testDir);
			expect(result?.runtime?.name).toBe('bun');
			expect(result?.runtime?.port).toBeUndefined();
		});

		test('rejects a string runtime.port, reporting the path runtime.port', async () => {
			writeFileSync(join(testDir, 'launch.json'), JSON.stringify({ runtime: { port: '3000' } }));
			let thrown: unknown;
			try {
				await readUserLaunchOverride(testDir);
			} catch (ex) {
				thrown = ex;
			}
			expect(thrown).toBeInstanceOf(LaunchConfigError);
			expect((thrown as LaunchConfigError).issues.some((i) => i.path === 'runtime.port')).toBe(
				true
			);
		});

		test('rejects a string processes[].default, reporting a path that mentions default', async () => {
			writeFileSync(
				join(testDir, 'launch.json'),
				JSON.stringify({
					processes: [{ type: 'web', command: 'node server.js', default: 'true' }],
				})
			);
			let thrown: unknown;
			try {
				await readUserLaunchOverride(testDir);
			} catch (ex) {
				thrown = ex;
			}
			expect(thrown).toBeInstanceOf(LaunchConfigError);
			expect((thrown as LaunchConfigError).issues.some((i) => i.path.includes('default'))).toBe(
				true
			);
		});
	});
});
