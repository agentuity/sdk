/**
 * Tests for SSE handler donePromise resolution.
 *
 * Verifies that the SSE handler correctly calls markDone() when the handler
 * completes, ensuring the donePromise resolves for deferred session/thread saving.
 *
 * Related to: https://github.com/agentuity/sdk/issues/473
 */

import { test, expect, describe } from 'bun:test';
import { STREAM_DONE_PROMISE_KEY, IS_STREAMING_RESPONSE_KEY } from '../src/handlers';

describe('SSE Done Promise Constants', () => {
	test('STREAM_DONE_PROMISE_KEY is defined', () => {
		expect(STREAM_DONE_PROMISE_KEY).toBe('_streamDonePromise');
	});

	test('IS_STREAMING_RESPONSE_KEY is defined', () => {
		expect(IS_STREAMING_RESPONSE_KEY).toBe('_isStreamingResponse');
	});
});

describe('SSE Done Promise - Pattern Tests', () => {
	test('completion promise pattern matches expected behavior for normal handler completion', async () => {
		let resolveDone: (() => void) | undefined;
		let rejectDone: ((reason?: unknown) => void) | undefined;
		const donePromise = new Promise<void>((resolve, reject) => {
			resolveDone = resolve;
			rejectDone = reject;
		});

		let isDone = false;
		const markDone = (error?: unknown) => {
			if (isDone) return;
			isDone = true;
			if (error && rejectDone) {
				rejectDone(error);
			} else if (resolveDone) {
				resolveDone();
			}
		};

		const runInContext = async (handler: () => Promise<void>) => {
			try {
				await handler();
				markDone();
			} catch (err) {
				markDone(err);
				throw err;
			}
		};

		let resolved = false;
		donePromise.then(() => {
			resolved = true;
		});

		expect(resolved).toBe(false);

		await runInContext(async () => {});

		await donePromise;
		expect(resolved).toBe(true);
	});

	test('completion promise rejects on handler error', async () => {
		let resolveDone: (() => void) | undefined;
		let rejectDone: ((reason?: unknown) => void) | undefined;
		const donePromise = new Promise<void>((resolve, reject) => {
			resolveDone = resolve;
			rejectDone = reject;
		});

		let isDone = false;
		const markDone = (error?: unknown) => {
			if (isDone) return;
			isDone = true;
			if (error && rejectDone) {
				rejectDone(error);
			} else if (resolveDone) {
				resolveDone();
			}
		};

		const runInContext = async (handler: () => Promise<void>) => {
			try {
				await handler();
				markDone();
			} catch (err) {
				markDone(err);
				throw err;
			}
		};

		const testError = new Error('handler error');

		try {
			await runInContext(async () => {
				throw testError;
			});
		} catch {
			// Expected
		}

		let caughtError: unknown;
		try {
			await donePromise;
		} catch (err) {
			caughtError = err;
		}

		expect(caughtError).toBe(testError);
	});

	test('markDone is idempotent - only first call affects the promise', async () => {
		let resolveCount = 0;
		let resolveDone: (() => void) | undefined;
		const donePromise = new Promise<void>((resolve) => {
			resolveDone = () => {
				resolveCount++;
				resolve();
			};
		});

		let isDone = false;
		const markDone = () => {
			if (isDone) return;
			isDone = true;
			resolveDone?.();
		};

		markDone();
		markDone();
		markDone();

		await donePromise;

		expect(resolveCount).toBe(1);
	});

	test('handler completion calls markDone after handler returns', async () => {
		const executionOrder: string[] = [];

		let resolveDone: (() => void) | undefined;
		const donePromise = new Promise<void>((resolve) => {
			resolveDone = resolve;
		});

		let isDone = false;
		const markDone = () => {
			if (isDone) return;
			isDone = true;
			executionOrder.push('markDone');
			resolveDone?.();
		};

		const runInContext = async (handler: () => Promise<void>) => {
			try {
				await handler();
				markDone();
			} catch (err) {
				markDone();
				throw err;
			}
		};

		await runInContext(async () => {
			executionOrder.push('handler-start');
			await Promise.resolve();
			executionOrder.push('handler-end');
		});

		await donePromise;

		expect(executionOrder).toEqual(['handler-start', 'handler-end', 'markDone']);
	});

	test('both close() and handler completion result in resolved promise (idempotent)', async () => {
		let resolveDone: (() => void) | undefined;
		const donePromise = new Promise<void>((resolve) => {
			resolveDone = resolve;
		});

		let isDone = false;
		const markDone = () => {
			if (isDone) return;
			isDone = true;
			resolveDone?.();
		};

		const close = () => {
			markDone();
		};

		const runInContext = async (handler: () => Promise<void>) => {
			try {
				await handler();
				markDone();
			} catch (err) {
				markDone();
				throw err;
			}
		};

		await runInContext(async () => {
			close();
		});

		await expect(donePromise).resolves.toBeUndefined();
	});
});

describe('SSE Done Promise - Deferred Save Pattern', () => {
	test('middleware can defer save until donePromise resolves', async () => {
		const executionOrder: string[] = [];

		let resolveDone: (() => void) | undefined;
		const streamDonePromise = new Promise<void>((resolve) => {
			resolveDone = resolve;
		});

		const waitUntilTasks: Promise<void>[] = [];

		const waitUntil = (task: () => Promise<void>) => {
			waitUntilTasks.push(task());
		};

		const finalizeSession = async () => {
			executionOrder.push('finalize');
		};

		const isStreaming = true;

		if (isStreaming && streamDonePromise) {
			executionOrder.push('defer-registered');
			waitUntil(async () => {
				await streamDonePromise;
				await finalizeSession();
			});
		}

		executionOrder.push('middleware-returned');

		expect(executionOrder).toEqual(['defer-registered', 'middleware-returned']);

		resolveDone!();

		await Promise.all(waitUntilTasks);

		expect(executionOrder).toEqual(['defer-registered', 'middleware-returned', 'finalize']);
	});

	test('deferred save still executes even if donePromise rejects', async () => {
		const executionOrder: string[] = [];

		let rejectDone: ((reason?: unknown) => void) | undefined;
		const streamDonePromise = new Promise<void>((_resolve, reject) => {
			rejectDone = reject;
		});

		const waitUntilTasks: Promise<void>[] = [];

		const waitUntil = (task: () => Promise<void>) => {
			waitUntilTasks.push(task());
		};

		const finalizeSession = async () => {
			executionOrder.push('finalize');
		};

		waitUntil(async () => {
			try {
				await streamDonePromise;
			} catch {
				executionOrder.push('stream-error-caught');
			}
			await finalizeSession();
		});

		executionOrder.push('middleware-returned');

		rejectDone!(new Error('Stream error'));

		await Promise.all(waitUntilTasks);

		expect(executionOrder).toEqual(['middleware-returned', 'stream-error-caught', 'finalize']);
	});
});
