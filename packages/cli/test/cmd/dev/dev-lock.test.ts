import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// We need to test the dev-lock module
// Import path will be relative to this test file
const devLockPath = join(import.meta.dir, '../../../src/cmd/dev/dev-lock.ts');

describe('DevLockManager', () => {
	let testDir: string;
	let mockLogger: {
		debug: (...args: unknown[]) => void;
		warn: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};

	beforeEach(() => {
		testDir = join(tmpdir(), `dev-lock-test-${Date.now()}-${randomUUID()}`);
		mkdirSync(testDir, { recursive: true });

		mockLogger = {
			debug: () => {},
			warn: () => {},
			error: () => {},
		};
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore
		}

		// Clear module cache for dev-lock to avoid state leaking between tests
		// This is important because dev-lock uses module-level globals
	});

	describe('prepareDevLock', () => {
		test('creates a new lockfile when none exists', async () => {
			const { prepareDevLock } = await import(devLockPath);

			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			expect(lock).toBeDefined();
			expect(lock.state).toBeDefined();
			expect(lock.state.version).toBe(1);
			expect(lock.state.projectRoot).toBe(testDir);
			expect(lock.state.mainPid).toBe(process.pid);
			expect(lock.state.ports.bun).toBe(3500);
			expect(lock.state.instanceId).toBeDefined();
			expect(lock.state.createdAt).toBeDefined();

			// Verify lockfile exists
			const lockPath = join(testDir, '.agentuity', 'devserver.lock');
			expect(existsSync(lockPath)).toBe(true);

			// Cleanup
			await lock.release();
		});

		test('cleans up stale lockfile from previous session', async () => {
			const { prepareDevLock } = await import(devLockPath);

			// Create a stale lockfile with a non-existent PID
			const staleLockPath = join(testDir, '.agentuity', 'devserver.lock');
			mkdirSync(dirname(staleLockPath), { recursive: true });

			const staleLock = {
				version: 1,
				projectRoot: testDir,
				mainPid: 99999999, // Non-existent PID
				instanceId: randomUUID(),
				createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
				updatedAt: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
				ports: { bun: 3500 },
				children: [],
			};

			writeFileSync(staleLockPath, JSON.stringify(staleLock, null, 2));

			// PrepareDevLock should clean up the stale lock
			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			// Should have created a new lock with our PID
			expect(lock.state.mainPid).toBe(process.pid);
			expect(lock.state.instanceId).not.toBe(staleLock.instanceId);

			await lock.release();
		});

		test('replaces existing lockfile when process is still running', async () => {
			const { prepareDevLock } = await import(devLockPath);

			// Create a lockfile with our own PID (simulating a "running" process)
			const existingLockPath = join(testDir, '.agentuity', 'devserver.lock');
			mkdirSync(dirname(existingLockPath), { recursive: true });

			const existingLock = {
				version: 1,
				projectRoot: testDir,
				mainPid: process.pid, // Same PID = same process
				instanceId: randomUUID(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				ports: { bun: 3500 },
				children: [],
			};

			writeFileSync(existingLockPath, JSON.stringify(existingLock, null, 2));

			// Should still work (replaces the existing lock)
			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			expect(lock.state.mainPid).toBe(process.pid);
			expect(lock.state.instanceId).not.toBe(existingLock.instanceId);

			await lock.release();
		});
	});

	describe('lock management', () => {
		test('registerChild adds child process to lockfile', async () => {
			const { prepareDevLock } = await import(devLockPath);

			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			await lock.registerChild({
				pid: 12345,
				type: 'gravity',
				description: 'Gravity tunnel process',
			});

			expect(lock.state.children).toHaveLength(1);
			expect(lock.state.children[0]?.pid).toBe(12345);
			expect(lock.state.children[0]?.type).toBe('gravity');

			// Verify it was written to disk
			const lockPath = join(testDir, '.agentuity', 'devserver.lock');
			const raw = readFileSync(lockPath, 'utf8');
			const parsed = JSON.parse(raw);
			expect(parsed.children).toHaveLength(1);

			await lock.release();
		});

		test('registerChild ignores duplicate PIDs', async () => {
			const { prepareDevLock } = await import(devLockPath);

			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			await lock.registerChild({ pid: 12345, type: 'gravity' });
			await lock.registerChild({ pid: 12345, type: 'gravity' }); // Duplicate

			expect(lock.state.children).toHaveLength(1);

			await lock.release();
		});

		test('updatePorts updates port information', async () => {
			const { prepareDevLock } = await import(devLockPath);

			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			await lock.updatePorts({ vite: 3502, gravity: 3503 });

			expect(lock.state.ports.bun).toBe(3500);
			expect(lock.state.ports.vite).toBe(3502);
			expect(lock.state.ports.gravity).toBe(3503);

			await lock.release();
		});

		test('release removes the lockfile', async () => {
			const { prepareDevLock } = await import(devLockPath);

			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			const lockPath = join(testDir, '.agentuity', 'devserver.lock');
			expect(existsSync(lockPath)).toBe(true);

			await lock.release();

			expect(existsSync(lockPath)).toBe(false);
		});
	});

	describe('lockfile format', () => {
		test('lockfile is valid JSON with expected structure', async () => {
			const { prepareDevLock } = await import(devLockPath);

			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			const lockPath = join(testDir, '.agentuity', 'devserver.lock');
			const raw = readFileSync(lockPath, 'utf8');
			const parsed = JSON.parse(raw);

			// Verify all expected fields
			expect(parsed.version).toBe(1);
			expect(parsed.projectRoot).toBe(testDir);
			expect(typeof parsed.mainPid).toBe('number');
			expect(typeof parsed.instanceId).toBe('string');
			expect(typeof parsed.createdAt).toBe('string');
			expect(typeof parsed.updatedAt).toBe('string');
			expect(typeof parsed.ports).toBe('object');
			expect(Array.isArray(parsed.children)).toBe(true);

			await lock.release();
		});

		test('updatedAt is refreshed on each write', async () => {
			const { prepareDevLock } = await import(devLockPath);

			const lock = await prepareDevLock(testDir, 3500, mockLogger);
			const firstUpdatedAt = lock.state.updatedAt;

			// Wait a bit to ensure timestamp difference
			await new Promise((r) => setTimeout(r, 10));

			await lock.updatePorts({ vite: 3502 });

			expect(lock.state.updatedAt).not.toBe(firstUpdatedAt);

			await lock.release();
		});
	});

	describe('edge cases', () => {
		test('handles missing .agentuity directory', async () => {
			const { prepareDevLock } = await import(devLockPath);

			// testDir exists but .agentuity does not
			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			expect(existsSync(join(testDir, '.agentuity'))).toBe(true);

			await lock.release();
		});

		test('handles corrupted lockfile gracefully', async () => {
			const { prepareDevLock } = await import(devLockPath);

			// Write invalid JSON
			const lockPath = join(testDir, '.agentuity', 'devserver.lock');
			mkdirSync(dirname(lockPath), { recursive: true });
			writeFileSync(lockPath, 'not valid json {{{');

			// Should not throw - should clean up and create new lock
			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			expect(lock).toBeDefined();
			expect(lock.state.mainPid).toBe(process.pid);

			await lock.release();
		});

		test('handles lockfile with wrong version', async () => {
			const { prepareDevLock } = await import(devLockPath);

			const lockPath = join(testDir, '.agentuity', 'devserver.lock');
			mkdirSync(dirname(lockPath), { recursive: true });

			const oldLock = {
				version: 999, // Unknown version
				projectRoot: testDir,
			};
			writeFileSync(lockPath, JSON.stringify(oldLock));

			// Should treat as invalid and create new lock
			const lock = await prepareDevLock(testDir, 3500, mockLogger);

			expect(lock.state.version).toBe(1);

			await lock.release();
		});
	});
});

describe('releaseLockSync', () => {
	let testDir: string;
	let mockLogger: {
		debug: () => void;
		warn: () => void;
		error: () => void;
	};

	beforeEach(() => {
		testDir = join(tmpdir(), `dev-lock-sync-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		mockLogger = { debug: () => {}, warn: () => {}, error: () => {} };
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore
		}
	});

	test('removes lockfile synchronously', async () => {
		const { prepareDevLock, releaseLockSync } = await import(devLockPath);

		await prepareDevLock(testDir, 3500, mockLogger);
		const lockPath = join(testDir, '.agentuity', 'devserver.lock');

		expect(existsSync(lockPath)).toBe(true);

		releaseLockSync(testDir);

		expect(existsSync(lockPath)).toBe(false);
	});

	test('does not throw if lockfile does not exist', async () => {
		const { releaseLockSync } = await import(devLockPath);

		// Should not throw
		expect(() => releaseLockSync(testDir)).not.toThrow();
	});
});

describe('cleanupLockfile', () => {
	let testDir: string;
	let mockLogger: {
		debug: () => void;
		warn: () => void;
		error: () => void;
	};

	beforeEach(() => {
		testDir = join(tmpdir(), `dev-lock-cleanup-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		mockLogger = { debug: () => {}, warn: () => {}, error: () => {} };
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore
		}
	});

	test('removes lockfile and kills referenced processes', async () => {
		const { prepareDevLock, cleanupLockfile } = await import(devLockPath);

		// Create a lock with a fake child process (PID that doesn't exist)
		const lock = await prepareDevLock(testDir, 3500, mockLogger);

		// Manually add a non-existent child PID
		lock.state.children.push({
			pid: 99999998,
			type: 'gravity',
			description: 'Test child',
		});

		await lock.release();

		// Re-create the lockfile with the child
		const lockPath = join(testDir, '.agentuity', 'devserver.lock');
		writeFileSync(lockPath, JSON.stringify(lock.state, null, 2));

		// cleanupLockfile should handle this without throwing
		await cleanupLockfile(testDir, mockLogger);

		expect(existsSync(lockPath)).toBe(false);
	});
});
