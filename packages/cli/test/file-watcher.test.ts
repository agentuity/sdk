/**
 * File Watcher Unit Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createFileWatcher } from '../src/cmd/dev/file-watcher';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('File Watcher', () => {
	let testDir: string;
	let restartCount: number;
	let watcher: ReturnType<typeof createFileWatcher> | null;

	beforeEach(async () => {
		// Create temp directory for testing
		testDir = await mkdtemp(join(tmpdir(), 'file-watcher-test-'));

		// Create src directory structure
		await Bun.$`mkdir -p ${join(testDir, 'src', 'api')}`;
		await Bun.$`mkdir -p ${join(testDir, 'src', 'agent')}`;
		await Bun.$`mkdir -p ${join(testDir, 'src', 'lib')}`;

		// Create app.ts
		await writeFile(join(testDir, 'app.ts'), 'export {}', 'utf-8');

		restartCount = 0;
	});

	afterEach(async () => {
		// Stop watcher
		if (watcher) {
			watcher.stop();
			watcher = null;
		}

		// Clean up temp directory
		await rm(testDir, { recursive: true, force: true });
	});

	test('creates watcher successfully', () => {
		watcher = createFileWatcher({
			rootDir: testDir,
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: (): never => {
					throw new Error('Fatal error');
				},
			},
			onRestart: () => {
				restartCount++;
			},
		});

		expect(watcher).toBeDefined();
		expect(typeof watcher.start).toBe('function');
		expect(typeof watcher.stop).toBe('function');
		expect(typeof watcher.pause).toBe('function');
		expect(typeof watcher.resume).toBe('function');
	});

	test('triggers restart on file change', async () => {
		watcher = createFileWatcher({
			rootDir: testDir,
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: (): never => {
					throw new Error('Fatal error');
				},
			},
			onRestart: () => {
				restartCount++;
			},
		});

		watcher.start();
		watcher.resume(); // Start watching

		// Write a file
		await writeFile(join(testDir, 'src', 'api', 'test.ts'), 'export {}', 'utf-8');

		// Wait for file watcher to detect change
		await Bun.sleep(1000);

		expect(restartCount).toBeGreaterThan(0);
	});

	test('does not trigger restart when paused', async () => {
		watcher = createFileWatcher({
			rootDir: testDir,
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: (): never => {
					throw new Error('Fatal error');
				},
			},
			onRestart: () => {
				restartCount++;
			},
		});

		watcher.start();
		watcher.pause();

		// Write a file while paused
		await writeFile(join(testDir, 'src', 'api', 'test2.ts'), 'export {}', 'utf-8');

		// Wait
		await Bun.sleep(1000);

		expect(restartCount).toBe(0);
	});

	test('ignores changes in .agentuity directory', async () => {
		watcher = createFileWatcher({
			rootDir: testDir,
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: (): never => {
					throw new Error('Fatal error');
				},
			},
			onRestart: () => {
				restartCount++;
			},
		});

		watcher.start();
		watcher.resume();

		// Create .agentuity directory and write file
		await Bun.$`mkdir -p ${join(testDir, '.agentuity')}`;
		await writeFile(join(testDir, '.agentuity', 'app.js'), 'console.log("test")', 'utf-8');

		// Wait
		await Bun.sleep(1000);

		expect(restartCount).toBe(0);
	});

	test('ignores changes in node_modules', async () => {
		watcher = createFileWatcher({
			rootDir: testDir,
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: (): never => {
					throw new Error('Fatal error');
				},
			},
			onRestart: () => {
				restartCount++;
			},
		});

		watcher.start();
		watcher.resume();

		// Create node_modules and write file
		await Bun.$`mkdir -p ${join(testDir, 'node_modules', 'some-package')}`;
		await writeFile(
			join(testDir, 'node_modules', 'some-package', 'index.js'),
			'module.exports = {}',
			'utf-8'
		);

		// Wait
		await Bun.sleep(1000);

		expect(restartCount).toBe(0);
	});

	test('resumes watching after pause', async () => {
		watcher = createFileWatcher({
			rootDir: testDir,
			logger: {
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: (): never => {
					throw new Error('Fatal error');
				},
			},
			onRestart: () => {
				restartCount++;
			},
		});

		watcher.start();
		watcher.pause();

		// Write while paused
		await writeFile(join(testDir, 'src', 'api', 'test3.ts'), 'export {}', 'utf-8');
		await Bun.sleep(1000);
		expect(restartCount).toBe(0);

		// Resume and write again
		watcher.resume();
		await writeFile(join(testDir, 'src', 'api', 'test4.ts'), 'export {}', 'utf-8');
		await Bun.sleep(1000);

		expect(restartCount).toBeGreaterThan(0);
	});
});
