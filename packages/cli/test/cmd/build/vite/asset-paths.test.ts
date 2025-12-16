/**
 * Test asset path generation for deployment
 */
import { test, expect, describe } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { generateMetadata } from '../../../../src/cmd/build/vite/metadata-generator';
import type { Logger } from '../../../../src/types';

const mockLogger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: ((..._args: unknown[]): never => {
		throw new Error('Fatal');
	}) as Logger['fatal'],
};

describe('Asset Path Generation', () => {
	const testDir = join(import.meta.dir, 'test-asset-paths');

	// Clean up before and after tests
	const cleanup = () => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	};

	test('asset filenames include subdirectory prefix', async () => {
		cleanup();

		// Setup test directory structure matching Vite output
		const agentuityDir = join(testDir, '.agentuity');
		const clientDir = join(agentuityDir, 'client');
		const clientAssetsDir = join(clientDir, 'assets');
		const clientViteDir = join(clientDir, '.vite');

		mkdirSync(clientAssetsDir, { recursive: true });
		mkdirSync(clientViteDir, { recursive: true });

		// Create test assets
		writeFileSync(join(clientAssetsDir, 'main-abc123.js'), 'console.log("test");');
		writeFileSync(join(clientAssetsDir, 'main-abc123.css'), 'body { margin: 0; }');
		writeFileSync(join(clientAssetsDir, 'logo-xyz789.svg'), '<svg></svg>');

		// Create Vite manifest
		const manifest = {
			'main.tsx': {
				file: 'assets/main-abc123.js',
				src: 'main.tsx',
				isEntry: true,
				css: ['assets/main-abc123.css'],
			},
			'logo.svg': {
				file: 'assets/logo-xyz789.svg',
				src: 'logo.svg',
			},
		};

		writeFileSync(join(clientViteDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

		// Generate metadata
		const metadata = await generateMetadata({
			rootDir: testDir,
			projectId: 'test-project',
			orgId: 'test-org',
			agents: [],
			routes: [],
			dev: false,
			logger: mockLogger,
		});

		// Verify assets have correct paths with subdirectory prefix
		expect(metadata.assets).toBeDefined();
		expect(metadata.assets!.length).toBeGreaterThan(0);

		const jsAsset = metadata.assets!.find((a) => a.filename.endsWith('.js'));
		const cssAsset = metadata.assets!.find((a) => a.filename.endsWith('.css'));
		const svgAsset = metadata.assets!.find((a) => a.filename.endsWith('.svg'));

		// Critical: filenames MUST include "client/" prefix for deployment
		expect(jsAsset?.filename).toBe('client/assets/main-abc123.js');
		expect(cssAsset?.filename).toBe('client/assets/main-abc123.css');
		expect(svgAsset?.filename).toBe('client/assets/logo-xyz789.svg');

		// Verify files can be found using the generated paths
		for (const asset of metadata.assets!) {
			const fullPath = join(testDir, '.agentuity', asset.filename);
			expect(existsSync(fullPath)).toBe(true);
		}

		cleanup();
	});

	test('workbench assets include workbench prefix', async () => {
		cleanup();

		const agentuityDir = join(testDir, '.agentuity');
		const workbenchDir = join(agentuityDir, 'workbench');
		const workbenchAssetsDir = join(workbenchDir, 'assets');
		const workbenchViteDir = join(workbenchDir, '.vite');

		mkdirSync(workbenchAssetsDir, { recursive: true });
		mkdirSync(workbenchViteDir, { recursive: true });

		writeFileSync(join(workbenchAssetsDir, 'workbench-def456.js'), 'console.log("workbench");');

		const manifest = {
			'main.tsx': {
				file: 'assets/workbench-def456.js',
				src: 'main.tsx',
				isEntry: true,
			},
		};

		writeFileSync(join(workbenchViteDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

		const metadata = await generateMetadata({
			rootDir: testDir,
			projectId: 'test-project',
			agents: [],
			routes: [],
			dev: false,
			logger: mockLogger,
		});

		const workbenchAsset = metadata.assets!.find((a) => a.filename.includes('workbench'));
		expect(workbenchAsset?.filename).toBe('workbench/assets/workbench-def456.js');

		cleanup();
	});

	test('asset paths work with deployment join', async () => {
		cleanup();

		const agentuityDir = join(testDir, '.agentuity');
		const clientDir = join(agentuityDir, 'client');
		const clientAssetsDir = join(clientDir, 'assets');
		const clientViteDir = join(clientDir, '.vite');

		mkdirSync(clientAssetsDir, { recursive: true });
		mkdirSync(clientViteDir, { recursive: true });

		writeFileSync(join(clientAssetsDir, 'test-file.js'), 'test');

		const manifest = {
			'test.js': {
				file: 'assets/test-file.js',
				isEntry: true,
			},
		};

		writeFileSync(join(clientViteDir, 'manifest.json'), JSON.stringify(manifest));

		const metadata = await generateMetadata({
			rootDir: testDir,
			projectId: 'test',
			agents: [],
			routes: [],
			logger: mockLogger,
		});

		// Simulate deploy.ts logic
		const asset = metadata.assets![0];
		const deployPath = join(testDir, '.agentuity', asset.filename);

		// This should resolve to the correct file
		expect(existsSync(deployPath)).toBe(true);
		expect(deployPath).toBe(join(clientAssetsDir, 'test-file.js'));

		cleanup();
	});
});
