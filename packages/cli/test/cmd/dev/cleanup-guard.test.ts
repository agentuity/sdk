import { describe, test, expect, beforeEach } from 'bun:test';
import { ProcessManager } from '../../../src/cmd/dev/process-manager';

/**
 * Tests for the cleanup/safeExit guard-ordering fix.
 *
 * The root cause of the orphan-process bug was:
 *   - safeExit() set shutdownRequested = true BEFORE calling cleanup()
 *   - cleanup() early-returned on `if (shutdownRequested) return;`
 *   - Result: cleanup() never ran, bun subprocess was never signalled
 *
 * The fix introduces a separate `cleanupStarted` flag for the double-entry
 * guard, so `shutdownRequested` (which breaks the wait loop) is only set
 * INSIDE cleanup() after the guard passes.
 *
 * These tests verify the corrected guard logic by simulating the same
 * flag + function interactions used in packages/cli/src/cmd/dev/index.ts.
 */

const mockLogger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: () => {},
	child: () => mockLogger,
};

describe('cleanup guard ordering (SIGINT flow)', () => {
	let procManager: ProcessManager;

	beforeEach(() => {
		procManager = new ProcessManager(mockLogger);
	});

	test('cleanup() runs procManager.cleanup when called via safeExit pattern', async () => {
		// Simulate the corrected flag pattern from dev/index.ts
		let shutdownRequested = false;
		let cleanupStarted = false;
		let cleanupRan = false;

		const cleanup = async (_exitAfter = false, _exitCode = 0) => {
			if (cleanupStarted) return;
			cleanupStarted = true;
			shutdownRequested = true;

			// This is the critical line — must actually execute
			await procManager.cleanup('shutdown', 200);
			cleanupRan = true;
		};

		const safeExit = (code: number) => {
			// The fix: NO shutdownRequested = true here
			cleanup(true, code).catch(() => {});
		};

		// Register a mock child process that "exits" after SIGTERM
		let childKilled = false;
		const mockProc = {
			kill: () => {
				childKilled = true;
				mockProc.exitCode = 0;
			},
			exitCode: null as number | null,
			pid: undefined as number | undefined,
		};
		procManager.registerProcess({
			id: 'bun-backend',
			process: mockProc,
			description: 'Bun backend server (--hot)',
			port: 3501,
			critical: true,
		});

		// Simulate SIGINT → safeExit(0)
		safeExit(0);

		// Wait for async cleanup to complete
		await new Promise((resolve) => setTimeout(resolve, 1000));

		expect(cleanupRan).toBe(true);
		expect(shutdownRequested).toBe(true);
		expect(childKilled).toBe(true);
		expect(procManager.isCleanedUp).toBe(true);
	});

	test('OLD BUG: cleanup is skipped when shutdownRequested set before cleanup call', async () => {
		// This test documents the OLD broken behavior to prove the fix matters.
		// With the old code, safeExit set shutdownRequested = true before cleanup(),
		// and cleanup checked `if (shutdownRequested) return;`, causing a no-op.
		let shutdownRequested = false;
		let cleanupRan = false;

		// Simulate OLD buggy cleanup() that uses shutdownRequested as the guard
		const buggyCleanup = async () => {
			if (shutdownRequested) return; // Old guard — causes the bug
			shutdownRequested = true;
			await procManager.cleanup('shutdown');
			cleanupRan = true;
		};

		// Simulate OLD buggy safeExit
		const buggySafeExit = () => {
			shutdownRequested = true; // Bug: set BEFORE calling cleanup
			buggyCleanup().catch(() => {});
		};

		let childKilled = false;
		procManager.registerProcess({
			id: 'bun-backend',
			process: {
				kill: () => {
					childKilled = true;
				},
				exitCode: null,
				pid: undefined,
			},
			description: 'Bun backend server (--hot)',
			critical: true,
		});

		buggySafeExit();
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Cleanup never ran — this is the bug
		expect(cleanupRan).toBe(false);
		expect(childKilled).toBe(false);
	});

	test('cleanup() is not entered twice (double-SIGINT)', async () => {
		let cleanupStarted = false;
		let shutdownRequested = false;
		let cleanupCallCount = 0;

		const cleanup = async () => {
			if (cleanupStarted) return;
			cleanupStarted = true;
			shutdownRequested = true;

			cleanupCallCount++;
			await procManager.cleanup('shutdown');
		};

		procManager.registerProcess({
			id: 'bun-backend',
			process: {
				kill: () => {},
				exitCode: null,
				pid: undefined,
			},
			description: 'Bun backend server (--hot)',
			critical: true,
		});

		// Simulate two rapid SIGINT signals
		cleanup().catch(() => {});
		cleanup().catch(() => {});

		await new Promise((resolve) => setTimeout(resolve, 500));

		expect(cleanupCallCount).toBe(1);
		expect(shutdownRequested).toBe(true);
	});

	test('shutdownRequested breaks the wait loop after cleanup starts', async () => {
		let cleanupStarted = false;
		let shutdownRequested = false;

		const cleanup = async () => {
			if (cleanupStarted) return;
			cleanupStarted = true;
			shutdownRequested = true;
			await procManager.cleanup('shutdown');
		};

		procManager.registerProcess({
			id: 'bun-backend',
			process: {
				kill: () => {},
				exitCode: null,
				pid: undefined,
			},
			description: 'Bun backend server',
			critical: true,
		});

		// Simulate the wait loop
		const waitPromise = new Promise<void>((resolve) => {
			const check = setInterval(() => {
				if (shutdownRequested) {
					clearInterval(check);
					resolve();
				}
			}, 50);
		});

		// Before cleanup, the loop should still be running
		expect(shutdownRequested).toBe(false);

		// Trigger cleanup (as SIGINT would)
		cleanup().catch(() => {});

		// Wait loop should resolve
		await waitPromise;

		expect(shutdownRequested).toBe(true);
		expect(cleanupStarted).toBe(true);
	});

	test('startup-failure cleanup works (no pre-set shutdownRequested)', async () => {
		// Startup-failure paths call `await cleanup(true, 1, true)` directly,
		// without setting shutdownRequested first. They should continue to work.
		let cleanupStarted = false;
		let cleanupRan = false;

		const cleanup = async (_exitAfter = false, _exitCode = 0, _silent = false) => {
			if (cleanupStarted) return;
			cleanupStarted = true;

			await procManager.cleanup('shutdown');
			cleanupRan = true;
			// Note: in the real code, originalExit() would be called here
			// if exitAfter is true. We skip that in the test.
		};

		let childKilled = false;
		procManager.registerProcess({
			id: 'bun-backend',
			process: {
				kill: () => {
					childKilled = true;
				},
				exitCode: null,
				pid: undefined,
			},
			description: 'Bun backend server (--hot)',
			critical: true,
		});

		// Simulate startup failure path
		await cleanup(true, 1, true);

		expect(cleanupRan).toBe(true);
		expect(childKilled).toBe(true);
	});

	test('stdin q/Ctrl-C cleanup works without pre-set shutdownRequested', async () => {
		// The stdin handler for 'q' / Ctrl-C used to set shutdownRequested = true
		// before calling cleanup(). The fix removes that pre-set.
		let cleanupStarted = false;
		let shutdownRequested = false;
		let cleanupRan = false;

		const cleanup = async (_exitAfter = false, _exitCode = 0) => {
			if (cleanupStarted) return;
			cleanupStarted = true;
			shutdownRequested = true;

			await procManager.cleanup('shutdown', 200);
			cleanupRan = true;
		};

		const mockProc = {
			kill: () => {
				mockProc.exitCode = 0;
			},
			exitCode: null as number | null,
			pid: undefined as number | undefined,
		};
		procManager.registerProcess({
			id: 'bun-backend',
			process: mockProc,
			description: 'Bun backend server (--hot)',
			critical: true,
		});

		// Simulate stdin 'q' handler (fixed version: no shutdownRequested = true before cleanup)
		cleanup(true, 0).catch(() => {});

		await new Promise((resolve) => setTimeout(resolve, 1000));

		expect(cleanupRan).toBe(true);
		expect(shutdownRequested).toBe(true);
	});

	test('cleanup kills child process registered with procManager', async () => {
		// End-to-end: spawn a real subprocess via Bun.spawn, register it,
		// trigger cleanup, and verify it's no longer alive.
		const child = Bun.spawn(['sleep', '60'], {
			stdout: 'ignore',
			stderr: 'ignore',
		});

		const childPid = child.pid;
		expect(childPid).toBeGreaterThan(1);

		procManager.registerProcess({
			id: 'test-child',
			process: child,
			description: 'Test child process',
			critical: false,
		});

		// Verify the child is alive
		expect(child.exitCode).toBeNull();

		// Run cleanup
		await procManager.cleanup('shutdown', 2000);

		// Brief wait for the process to fully terminate
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Verify the child is dead
		let isAlive = true;
		try {
			process.kill(childPid, 0); // Signal 0 = check existence
		} catch {
			isAlive = false;
		}

		expect(isAlive).toBe(false);
		expect(procManager.isCleanedUp).toBe(true);
	});
});
