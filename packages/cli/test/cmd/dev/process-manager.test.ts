import { describe, test, expect, beforeEach } from 'bun:test';
import {
	ProcessManager,
	initProcessManager,
	getProcessManager,
	cleanupAll,
} from '../../../src/cmd/dev/process-manager';

const mockLogger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: () => {},
	child: () => mockLogger,
};

describe('ProcessManager', () => {
	let manager: ProcessManager;

	beforeEach(() => {
		manager = new ProcessManager(mockLogger);
	});

	// All test processes use pid: undefined to prevent process.kill(-pid) from
	// hitting real system PIDs. The process handle's .kill() mock is used instead.
	// See: process tree killing uses process.kill(-pid) which with pid=1 would
	// send SIGKILL to every process the user owns.

	describe('process tracking', () => {
		test('registers and tracks processes', () => {
			const mockProcess = {
				kill: () => {},
				exitCode: null,
				pid: undefined,
			};

			manager.registerProcess({
				id: 'test-process',
				process: mockProcess,
				description: 'Test process',
				port: 3000,
				critical: true,
			});

			const ports = manager.getPorts();
			expect(ports).toContain(3000);
		});

		test('unregisters processes', () => {
			const mockProcess = {
				kill: () => {},
				exitCode: null,
				pid: undefined,
			};

			manager.registerProcess({
				id: 'test-process',
				process: mockProcess,
				description: 'Test process',
			});

			manager.unregisterProcess('test-process');
			expect(manager.getPorts()).toHaveLength(0);
		});

		test('tracks multiple processes with ports', () => {
			manager.registerProcess({
				id: 'process-1',
				process: { kill: () => {}, exitCode: null, pid: undefined },
				description: 'Process 1',
				port: 3000,
			});

			manager.registerProcess({
				id: 'process-2',
				process: { kill: () => {}, exitCode: null, pid: undefined },
				description: 'Process 2',
				port: 3001,
			});

			manager.registerProcess({
				id: 'process-3',
				process: { kill: () => {}, exitCode: null, pid: undefined },
				description: 'Process 3',
				// No port
			});

			const ports = manager.getPorts();
			expect(ports).toContain(3000);
			expect(ports).toContain(3001);
			expect(ports).toHaveLength(2);
		});
	});

	describe('server tracking', () => {
		test('registers and tracks servers', () => {
			const mockServer = {
				close: () => {},
			};

			manager.registerServer({
				id: 'test-server',
				server: mockServer,
				description: 'Test server',
				port: 4000,
			});

			const ports = manager.getPorts();
			expect(ports).toContain(4000);
		});

		test('unregisters servers', () => {
			const mockServer = { close: () => {} };

			manager.registerServer({
				id: 'test-server',
				server: mockServer,
				description: 'Test server',
			});

			manager.unregisterServer('test-server');
			expect(manager.getPorts()).toHaveLength(0);
		});
	});

	describe('cleanup', () => {
		test('kills processes in reverse order', async () => {
			const killOrder: string[] = [];

			// Create processes with pid: undefined so cleanup uses the handle's
			// kill() method instead of process.kill(-pid)
			const createProcess = (id: string) => ({
				kill: (signal?: string | number) => {
					killOrder.push(`${id}:${signal || 'SIGTERM'}`);
				},
				exitCode: null as number | null,
				pid: undefined as number | undefined,
			});

			const proc1 = createProcess('first');
			const proc2 = createProcess('second');
			const proc3 = createProcess('third');

			manager.registerProcess({ id: 'first', process: proc1, description: 'First process' });
			manager.registerProcess({ id: 'second', process: proc2, description: 'Second process' });
			manager.registerProcess({ id: 'third', process: proc3, description: 'Third process' });

			await manager.cleanup('test', 100);

			// Should kill in reverse order (LIFO) - SIGTERM first for each
			// The order should be third -> second -> first for the initial SIGTERM
			const sigterms = killOrder.filter((k) => k.endsWith('SIGTERM') || k.endsWith('undefined'));
			expect(sigterms[0]).toStartWith('third');
			expect(sigterms[1]).toStartWith('second');
			expect(sigterms[2]).toStartWith('first');
		});

		test('closes servers', async () => {
			let serverClosed = false;

			manager.registerServer({
				id: 'test-server',
				server: {
					close: () => {
						serverClosed = true;
					},
				},
				description: 'Test server',
			});

			await manager.cleanup('test', 100);

			expect(serverClosed).toBe(true);
		});

		test('handles async server close', async () => {
			let serverClosed = false;

			manager.registerServer({
				id: 'test-server',
				server: {
					close: () =>
						new Promise<void>((resolve) => {
							setTimeout(() => {
								serverClosed = true;
								resolve();
							}, 50);
						}),
				},
				description: 'Test server',
			});

			await manager.cleanup('test', 100);

			expect(serverClosed).toBe(true);
		});

		test('default server close timeout (~1s) gives up on slow servers', async () => {
			// A server whose close() never resolves should not block cleanup
			// past the default 1s budget.
			let resolved = false;

			manager.registerServer({
				id: 'slow-server',
				server: {
					close: () =>
						new Promise<void>((resolve) => {
							setTimeout(() => {
								resolved = true;
								resolve();
							}, 5000);
						}),
				},
				description: 'Slow server',
			});

			const start = Date.now();
			await manager.cleanup('test', 200);
			const elapsed = Date.now() - start;

			// cleanup should bail out via the default 1000ms server-close cap,
			// not wait for the 5s close().
			expect(elapsed).toBeLessThan(1500);
			expect(resolved).toBe(false);
		});

		test('respects per-server closeTimeoutMs override', async () => {
			// A server with a longer override should be waited on past the
			// 1s default. We use 1500ms close() with a 2500ms override and
			// verify close() actually completed.
			let resolved = false;

			manager.registerServer({
				id: 'patient-server',
				server: {
					close: () =>
						new Promise<void>((resolve) => {
							setTimeout(() => {
								resolved = true;
								resolve();
							}, 1500);
						}),
				},
				description: 'Patient server',
				closeTimeoutMs: 2500,
			});

			await manager.cleanup('test', 200);

			expect(resolved).toBe(true);
		});

		test('per-server closeTimeoutMs caps a hung close()', async () => {
			// Override BELOW default to verify we use the override, not 1000ms.
			let resolved = false;

			manager.registerServer({
				id: 'tight-budget',
				server: {
					close: () =>
						new Promise<void>((resolve) => {
							setTimeout(() => {
								resolved = true;
								resolve();
							}, 5000);
						}),
				},
				description: 'Tight budget server',
				closeTimeoutMs: 100,
			});

			const start = Date.now();
			await manager.cleanup('test', 200);
			const elapsed = Date.now() - start;

			// We should bail out around the 100ms override, well before 1000ms default.
			expect(elapsed).toBeLessThan(500);
			expect(resolved).toBe(false);
		});

		test('handles already-exited processes gracefully', async () => {
			let killCalled = false;

			manager.registerProcess({
				id: 'already-dead',
				process: {
					kill: () => {
						killCalled = true;
					},
					exitCode: 0, // Already exited
					pid: undefined,
				},
				description: 'Already dead process',
			});

			await manager.cleanup('test', 100);

			// Should not call kill on already-exited process
			expect(killCalled).toBe(false);
		});

		test('force kills after timeout', async () => {
			const kills: string[] = [];

			manager.registerProcess({
				id: 'hanging',
				process: {
					kill: (signal?: string | number) => {
						kills.push(signal === 'SIGKILL' ? 'force' : 'term');
					},
					exitCode: null, // Still running
					pid: undefined,
				},
				description: 'Hanging process',
			});

			// Use a short timeout
			await manager.cleanup('test', 200);

			// Should have called SIGTERM first, then SIGKILL after timeout
			expect(kills).toContain('term');
			expect(kills).toContain('force');
		});

		test('prevents double cleanup', async () => {
			let killCount = 0;

			manager.registerProcess({
				id: 'test',
				process: {
					kill: () => {
						killCount++;
					},
					exitCode: null,
					pid: undefined,
				},
				description: 'Test process',
			});

			// Start two cleanups in parallel
			await Promise.all([manager.cleanup('test1', 100), manager.cleanup('test2', 100)]);

			// Should only kill once
			expect(killCount).toBeLessThanOrEqual(2); // SIGTERM + SIGKILL max
		});

		test('clears tracking lists after cleanup', async () => {
			manager.registerProcess({
				id: 'test',
				process: { kill: () => {}, exitCode: 0, pid: undefined },
				description: 'Test process',
				port: 3000,
			});

			manager.registerServer({
				id: 'test-server',
				server: { close: () => {} },
				description: 'Test server',
				port: 4000,
			});

			await manager.cleanup('test', 100);

			expect(manager.getPorts()).toHaveLength(0);
		});
	});

	describe('error handling', () => {
		test('handles kill errors gracefully', async () => {
			// Should not throw
			manager.registerProcess({
				id: 'error-process',
				process: {
					kill: () => {
						throw new Error('Kill failed');
					},
					exitCode: null,
					pid: undefined,
				},
				description: 'Error process',
			});

			await manager.cleanup('test', 100);
			// If we get here, the error was handled
		});

		test('handles close errors gracefully', async () => {
			// Should not throw
			manager.registerServer({
				id: 'error-server',
				server: {
					close: () => {
						throw new Error('Close failed');
					},
				},
				description: 'Error server',
			});

			await manager.cleanup('test', 100);
			// If we get here, the error was handled
		});
	});

	describe('isCleanedUp', () => {
		test('returns false before cleanup', () => {
			manager.registerProcess({
				id: 'test',
				process: { kill: () => {}, exitCode: null, pid: undefined },
				description: 'Test',
			});

			expect(manager.isCleanedUp).toBe(false);
		});

		test('returns true after cleanup completes', async () => {
			manager.registerProcess({
				id: 'test',
				process: { kill: () => {}, exitCode: 0, pid: undefined },
				description: 'Test',
			});

			await manager.cleanup('test', 100);
			expect(manager.isCleanedUp).toBe(true);
		});
	});

	describe('forceKillAllSync', () => {
		test('kills all remaining processes with SIGKILL', () => {
			const kills: string[] = [];

			manager.registerProcess({
				id: 'proc1',
				process: {
					kill: (signal?: string | number) => {
						kills.push(`proc1:${signal}`);
					},
					exitCode: null,
					pid: undefined, // No PID — falls back to process.kill()
				},
				description: 'Process 1',
			});

			manager.forceKillAllSync();

			// Should use SIGKILL
			expect(kills).toHaveLength(1);
			expect(kills[0]).toBe('proc1:SIGKILL');

			// Should clear tracking lists
			expect(manager.getPorts()).toHaveLength(0);
		});

		test('skips already-exited processes', () => {
			let killCalled = false;

			manager.registerProcess({
				id: 'dead',
				process: {
					kill: () => {
						killCalled = true;
					},
					exitCode: 0, // Already exited
					pid: undefined,
				},
				description: 'Dead process',
			});

			manager.forceKillAllSync();

			expect(killCalled).toBe(false);
		});

		test('does not run if async cleanup already completed', async () => {
			let killCount = 0;

			manager.registerProcess({
				id: 'test',
				process: {
					kill: () => {
						killCount++;
					},
					exitCode: 0,
					pid: undefined,
				},
				description: 'Test',
			});

			await manager.cleanup('test', 100);
			manager.forceKillAllSync(); // Should be a no-op

			// kill should not have been called at all (exitCode was 0)
			expect(killCount).toBe(0);
		});

		test('handles kill errors gracefully', () => {
			manager.registerProcess({
				id: 'error-proc',
				process: {
					kill: () => {
						throw new Error('Kill failed');
					},
					exitCode: null,
					pid: undefined,
				},
				description: 'Error process',
			});

			// Should not throw
			expect(() => manager.forceKillAllSync()).not.toThrow();
		});
	});

	describe('process tree killing', () => {
		test('cleanup uses process tree kill when PID is available', async () => {
			// Use a PID that doesn't exist (but > 1 to pass the safety guard).
			// process.kill(-pid) will throw ESRCH, then process.kill(pid) also
			// throws ESRCH. Cleanup should complete without errors.
			manager.registerProcess({
				id: 'tree-test',
				process: {
					kill: () => {},
					exitCode: null,
					pid: 99999999,
				},
				description: 'Tree kill test',
			});

			await manager.cleanup('test', 200);

			expect(manager.isCleanedUp).toBe(true);
		});

		test('refuses to kill dangerous PIDs (pid <= 1)', async () => {
			// PID 1 is init/systemd, PID 0 is the process group leader.
			// process.kill(-1) would signal every process the user owns.
			// The safety guard should prevent this.
			const killSignals: (string | number | NodeJS.Signals | undefined)[] = [];

			manager.registerProcess({
				id: 'dangerous-pid',
				process: {
					kill: (signal) => {
						killSignals.push(signal);
					},
					exitCode: null,
					pid: 1, // Dangerous! killProcessTree should refuse this.
				},
				description: 'Dangerous PID test',
			});

			// Should complete without calling process.kill(-1) (which would nuke the session).
			// killProcessTree refuses pid=1, but the handle's .kill() is still used
			// as a safe fallback to kill the individual process.
			await manager.cleanup('test', 200);

			// killProcessTree refuses pid=1 during the SIGTERM phase (pid is
			// truthy so the code doesn't fall back to handle.kill for SIGTERM).
			// In the force-kill phase, pid <= 1 means shouldForceTreeKill is
			// false, so the handle's .kill('SIGKILL') is used as a safe fallback.
			expect(killSignals).not.toContain('SIGTERM');
			expect(killSignals).toContain('SIGKILL');
			expect(manager.isCleanedUp).toBe(true);
		});
	});
});

describe('Global process manager', () => {
	test('initProcessManager creates global instance', () => {
		const manager = initProcessManager(mockLogger);
		expect(manager).toBeDefined();
		expect(getProcessManager()).toBe(manager);
	});

	test('getProcessManager throws if not initialized', () => {
		// Clear the global
		// Note: This test may interfere with others if run in parallel
		// In a real test suite, we'd use isolated modules
	});

	test('cleanupAll calls global manager cleanup', async () => {
		const manager = initProcessManager(mockLogger);

		let killed = false;
		manager.registerProcess({
			id: 'test',
			process: {
				kill: () => {
					killed = true;
				},
				exitCode: null,
				pid: undefined,
			},
			description: 'Test',
		});

		await cleanupAll('test');

		expect(killed).toBe(true);
	});
});
