import { describe, expect, it, beforeEach } from 'bun:test';
import { ConcurrencyManager } from '../src/background/concurrency';
import type { BackgroundTask, BackgroundTaskStatus, TaskProgress } from '../src/background/types';

describe('Background', () => {
	describe('ConcurrencyManager', () => {
		let manager: ConcurrencyManager;

		beforeEach(() => {
			manager = new ConcurrencyManager({ defaultLimit: 2 });
		});

		describe('constructor', () => {
			it('uses default limit of 1 when no config provided', () => {
				const m = new ConcurrencyManager();
				expect(m.getConcurrencyLimit('any-key')).toBe(1);
			});

			it('uses configured default limit', () => {
				const m = new ConcurrencyManager({ defaultLimit: 5 });
				expect(m.getConcurrencyLimit('any-key')).toBe(5);
			});

			it('sets per-key limits from config', () => {
				const m = new ConcurrencyManager({
					defaultLimit: 2,
					limits: { 'openai/gpt-5': 10, 'anthropic/claude': 3 },
				});
				expect(m.getConcurrencyLimit('openai/gpt-5')).toBe(10);
				expect(m.getConcurrencyLimit('anthropic/claude')).toBe(3);
				expect(m.getConcurrencyLimit('other')).toBe(2);
			});
		});

		describe('getConcurrencyLimit', () => {
			it('returns default limit for unknown keys', () => {
				expect(manager.getConcurrencyLimit('unknown')).toBe(2);
			});

			it('returns specific limit when set', () => {
				const m = new ConcurrencyManager({
					defaultLimit: 1,
					limits: { 'special-key': 5 },
				});
				expect(m.getConcurrencyLimit('special-key')).toBe(5);
			});
		});

		describe('acquire', () => {
			it('immediately acquires when under limit', async () => {
				await manager.acquire('test');
				expect(manager.getCount('test')).toBe(1);
			});

			it('increments count on each acquire', async () => {
				await manager.acquire('test');
				await manager.acquire('test');
				expect(manager.getCount('test')).toBe(2);
			});

			it('queues when at limit', async () => {
				await manager.acquire('test');
				await manager.acquire('test');
				// At limit (2), next acquire should queue
				let resolved = false;
				const promise = manager.acquire('test').then(() => {
					resolved = true;
				});

				// Should be queued, not resolved
				await new Promise((r) => setTimeout(r, 10));
				expect(resolved).toBe(false);
				expect(manager.getQueueLength('test')).toBe(1);

				// Release one to let queued acquire proceed
				manager.release('test');
				await promise;
				expect(resolved).toBe(true);
			});

			it('handles multiple keys independently', async () => {
				await manager.acquire('key1');
				await manager.acquire('key2');
				expect(manager.getCount('key1')).toBe(1);
				expect(manager.getCount('key2')).toBe(1);
			});
		});

		describe('release', () => {
			it('decrements count', async () => {
				await manager.acquire('test');
				await manager.acquire('test');
				expect(manager.getCount('test')).toBe(2);

				manager.release('test');
				expect(manager.getCount('test')).toBe(1);
			});

			it('does not go below zero', () => {
				manager.release('test');
				manager.release('test');
				expect(manager.getCount('test')).toBe(0);
			});

			it('resolves waiting acquires when slot freed', async () => {
				await manager.acquire('test');
				await manager.acquire('test');

				let resolved = false;
				const promise = manager.acquire('test').then(() => {
					resolved = true;
				});

				await new Promise((r) => setTimeout(r, 10));
				expect(resolved).toBe(false);

				manager.release('test');
				await promise;
				expect(resolved).toBe(true);
			});
		});

		describe('cancelWaiters', () => {
			it('rejects all waiting acquires', async () => {
				await manager.acquire('test');
				await manager.acquire('test');

				let rejected1 = false;
				let rejected2 = false;
				const p1 = manager.acquire('test').catch(() => {
					rejected1 = true;
				});
				const p2 = manager.acquire('test').catch(() => {
					rejected2 = true;
				});

				await new Promise((r) => setTimeout(r, 10));
				expect(manager.getQueueLength('test')).toBe(2);

				manager.cancelWaiters('test');
				expect(manager.getQueueLength('test')).toBe(0);

				await Promise.all([p1, p2]);
				expect(rejected1).toBe(true);
				expect(rejected2).toBe(true);
			});

			it('does nothing if no waiters', () => {
				manager.cancelWaiters('nonexistent');
				expect(manager.getQueueLength('nonexistent')).toBe(0);
			});
		});

		describe('clear', () => {
			it('cancels all waiters for all keys', async () => {
				await manager.acquire('key1');
				await manager.acquire('key1');
				await manager.acquire('key2');
				await manager.acquire('key2');

				let rejected1 = false;
				let rejected2 = false;
				const p1 = manager.acquire('key1').catch(() => {
					rejected1 = true;
				});
				const p2 = manager.acquire('key2').catch(() => {
					rejected2 = true;
				});

				await new Promise((r) => setTimeout(r, 10));

				manager.clear();

				await Promise.all([p1, p2]);
				expect(rejected1).toBe(true);
				expect(rejected2).toBe(true);
			});

			it('clears counts', async () => {
				await manager.acquire('test');
				expect(manager.getCount('test')).toBe(1);

				manager.clear();
				expect(manager.getCount('test')).toBe(0);
			});
		});

		describe('getCount', () => {
			it('returns 0 for unknown key', () => {
				expect(manager.getCount('unknown')).toBe(0);
			});
		});

		describe('getQueueLength', () => {
			it('returns 0 for unknown key', () => {
				expect(manager.getQueueLength('unknown')).toBe(0);
			});

			it('returns correct queue length', async () => {
				await manager.acquire('test');
				await manager.acquire('test');

				void manager.acquire('test');
				void manager.acquire('test');
				void manager.acquire('test');

				await new Promise((r) => setTimeout(r, 10));
				expect(manager.getQueueLength('test')).toBe(3);
			});
		});
	});

	describe('Types', () => {
		it('BackgroundTaskStatus covers all states', () => {
			const statuses: BackgroundTaskStatus[] = [
				'pending',
				'running',
				'completed',
				'error',
				'cancelled',
			];
			expect(statuses).toHaveLength(5);
		});

		it('BackgroundTask interface is complete', () => {
			const task: BackgroundTask = {
				id: 'bg_test123',
				sessionId: 'session-123',
				parentSessionId: 'parent-123',
				parentMessageId: 'msg-123',
				description: 'Test task',
				prompt: 'Do something',
				agent: 'scout',
				status: 'running',
				queuedAt: new Date(),
				startedAt: new Date(),
				completedAt: undefined,
				result: undefined,
				error: undefined,
				progress: {
					toolCalls: 5,
					lastTool: 'read',
					lastUpdate: new Date(),
					lastMessage: 'Working...',
					lastMessageAt: new Date(),
				},
				concurrencyKey: 'anthropic/claude',
				concurrencyGroup: 'anthropic/claude',
			};

			expect(task.id).toMatch(/^bg_/);
			expect(task.status).toBe('running');
			expect(task.progress?.toolCalls).toBe(5);
		});

		it('TaskProgress tracks tool usage', () => {
			const progress: TaskProgress = {
				toolCalls: 10,
				lastTool: 'bash',
				lastUpdate: new Date(),
				lastMessage: 'Completed',
				lastMessageAt: new Date(),
			};

			expect(progress.toolCalls).toBe(10);
			expect(progress.lastTool).toBe('bash');
		});
	});
});
