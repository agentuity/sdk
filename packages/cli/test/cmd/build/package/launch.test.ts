import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	generateLaunchMetadata,
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

		test('writes Procfile', () => {
			const metadata = generateLaunchMetadata(
				{
					name: 'nuxt',
					runtime: 'node',
					packageManager: 'npm',
					buildCommand: 'nuxt build',
					buildOutput: '.output',
					startCommand: 'node .output/server/index.mjs',
					confidence: 'high',
				},
				{
					outputDir: testDir,
					startCommand: 'node .output/server/index.mjs',
					duration: 2000,
					logs: [],
				}
			);

			writeLaunchMetadata(testDir, metadata);

			const procfilePath = join(testDir, 'Procfile');
			expect(existsSync(procfilePath)).toBe(true);

			const content = readFileSync(procfilePath, 'utf-8');
			expect(content).toBe('web: node .output/server/index.mjs\n');
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

		test('handles multiple processes in Procfile', () => {
			const metadata = {
				processes: [
					{ type: 'web', command: 'node server.js', default: true },
					{ type: 'worker', command: 'node worker.js', default: false },
				],
				framework: { name: 'generic' },
				runtime: { name: 'node', port: 3000 },
				build: { date: new Date().toISOString(), duration: 1000 },
			};

			writeLaunchMetadata(testDir, metadata);

			const content = readFileSync(join(testDir, 'Procfile'), 'utf-8');
			expect(content).toContain('web: node server.js');
			expect(content).toContain('worker: node worker.js');
		});
	});

	// ── packageBuildOutput ──

	describe('packageBuildOutput', () => {
		test('writes .agentuity-build marker file', () => {
			const framework: DetectedFramework = {
				name: 'nextjs',
				version: '15.3.0',
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
				duration: 5000,
				logs: [],
			};

			packageBuildOutput(framework, buildResult, testDir);

			const markerPath = join(testDir, '.agentuity-build');
			expect(existsSync(markerPath)).toBe(true);

			const marker = JSON.parse(readFileSync(markerPath, 'utf-8'));
			expect(marker.version).toBe(1);
			expect(marker.framework).toBe('nextjs');
			expect(marker.runtime).toBe('node');
		});

		test('returns hasStaticAssets when staticDir exists', () => {
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

			const result = packageBuildOutput(framework, buildResult, testDir);
			expect(result.hasStaticAssets).toBe(true);
			expect(result.staticDir).toBe(staticDir);
		});

		test('returns hasStaticAssets false when no static dir', () => {
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

			const result = packageBuildOutput(framework, buildResult, testDir);
			expect(result.hasStaticAssets).toBe(false);
		});

		test('writes all three output files', () => {
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

			packageBuildOutput(framework, buildResult, testDir);

			expect(existsSync(join(testDir, 'launch.json'))).toBe(true);
			expect(existsSync(join(testDir, 'Procfile'))).toBe(true);
			expect(existsSync(join(testDir, '.agentuity-build'))).toBe(true);
		});
	});
});
