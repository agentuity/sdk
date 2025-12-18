/**
 * File Watcher Unit Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createFileWatcher } from '../src/cmd/dev/file-watcher';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

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

		// Pre-create ignore directories to avoid mkdir triggering events during tests
		await Bun.$`mkdir -p ${join(testDir, '.agentuity')}`;
		await Bun.$`mkdir -p ${join(testDir, 'node_modules', 'some-package')}`;

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

		// Give watcher time to settle
		await Bun.sleep(100);

		// Give watcher time to settle
		await Bun.sleep(100);

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

		// Give watcher time to settle and reset count after any initial events
		await Bun.sleep(100);
		restartCount = 0;

		// Create .agentuity directory and write file
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

		// Give watcher time to settle and reset count after any initial events
		await Bun.sleep(100);
		restartCount = 0;

		// Create node_modules and write file
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

	test('creates agent templates when new agent directory is created', async () => {
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

		// Give watcher time to settle
		await Bun.sleep(100);

		// Create a new agent directory (empty)
		const agentDir = join(testDir, 'src', 'agents', 'my-agent');
		await mkdir(agentDir, { recursive: true });

		// Wait for watcher to detect and create templates
		await Bun.sleep(1000);

		// Verify templates were created
		expect(existsSync(join(agentDir, 'agent.ts'))).toBe(true);
		expect(existsSync(join(agentDir, 'index.ts'))).toBe(true);

		// Verify content
		const agentContent = await readFile(join(agentDir, 'agent.ts'), 'utf-8');
		expect(agentContent).toContain('createAgent');
		expect(agentContent).toContain('MyAgent'); // PascalCase name

		const indexContent = await readFile(join(agentDir, 'index.ts'), 'utf-8');
		expect(indexContent).toContain("export { default } from './agent'");

		// Should also trigger restart
		expect(restartCount).toBeGreaterThan(0);
	});

	test('creates API templates when new API directory is created', async () => {
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

		// Give watcher time to settle
		await Bun.sleep(100);

		// Create a new API directory (empty)
		const apiDir = join(testDir, 'src', 'apis', 'my-api');
		await mkdir(apiDir, { recursive: true });

		// Wait for watcher to detect and create templates
		await Bun.sleep(1000);

		// Verify template was created
		expect(existsSync(join(apiDir, 'index.ts'))).toBe(true);

		// Verify content
		const indexContent = await readFile(join(apiDir, 'index.ts'), 'utf-8');
		expect(indexContent).toContain('createRouter');
		expect(indexContent).toContain("router.get('/'");

		// Should also trigger restart
		expect(restartCount).toBeGreaterThan(0);
	});

	test('does not create templates for non-empty directories', async () => {
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

		// Give watcher time to settle
		await Bun.sleep(100);

		// Create a new agent directory with a file already in it
		const agentDir = join(testDir, 'src', 'agents', 'existing-agent');
		await mkdir(agentDir, { recursive: true });
		await writeFile(join(agentDir, 'existing.ts'), 'export {}', 'utf-8');

		// Wait
		await Bun.sleep(1000);

		// Templates should NOT be created (directory was not empty)
		expect(existsSync(join(agentDir, 'agent.ts'))).toBe(false);
		expect(existsSync(join(agentDir, 'index.ts'))).toBe(false);
	});

	test('does not create templates for directories outside src/agents or src/apis', async () => {
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

		// Give watcher time to settle
		await Bun.sleep(100);

		// Create a directory in a different location
		const libDir = join(testDir, 'src', 'lib', 'utils');
		await mkdir(libDir, { recursive: true });

		// Wait
		await Bun.sleep(1000);

		// No templates should be created
		expect(existsSync(join(libDir, 'agent.ts'))).toBe(false);
		expect(existsSync(join(libDir, 'index.ts'))).toBe(false);
	});
});
