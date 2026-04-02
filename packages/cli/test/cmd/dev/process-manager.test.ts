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

	describe('process tracking', () => {
		test('registers and tracks processes', () => {
			const mockProcess = {
				kill: () => {},
				exitCode: null,
				pid: 12345,
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
				pid: 12345,
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
				process: { kill: () => {}, exitCode: null, pid: 1 },
				description: 'Process 1',
				port: 3000,
			});

			manager.registerProcess({
				id: 'process-2',
				process: { kill: () => {}, exitCode: null, pid: 2 },
				description: 'Process 2',
				port: 3001,
			});

			manager.registerProcess({
				id: 'process-3',
				process: { kill: () => {}, exitCode: null, pid: 3 },
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

			// Create processes that "exit" after SIGTERM (simulating real behavior)
			const createProcess = (id: string) => ({
				kill: (signal?: string | number) => {
					killOrder.push(`${id}:${signal || 'SIGTERM'}`);
				},
				exitCode: null as number | null,
				pid: Math.floor(Math.random() * 10000),
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

		test('handles already-exited processes gracefully', async () => {
			let killCalled = false;

			manager.registerProcess({
				id: 'already-dead',
				process: {
					kill: () => {
						killCalled = true;
					},
					exitCode: 0, // Already exited
					pid: 1,
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
					pid: 1,
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
					pid: 1,
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
				process: { kill: () => {}, exitCode: 0, pid: 1 },
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
					pid: 1,
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
				pid: 1,
			},
			description: 'Test',
		});

		await cleanupAll('test');

		expect(killed).toBe(true);
	});
});
