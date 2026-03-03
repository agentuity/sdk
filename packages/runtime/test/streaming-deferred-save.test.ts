/**
 * Tests for streaming response deferred save mechanism.
 *
 * Tests the internal mechanics of stream completion tracking without
 * relying on Hono's streaming APIs which have environment-specific behavior.
 *
 * Related to: https://github.com/agentuity/sdk/issues/454
 */

import { test, expect, describe } from 'bun:test';
import { STREAM_DONE_PROMISE_KEY, IS_STREAMING_RESPONSE_KEY } from '../src/handlers';

describe('Streaming Deferred Save Constants', () => {
	test('STREAM_DONE_PROMISE_KEY is defined', () => {
		expect(STREAM_DONE_PROMISE_KEY).toBe('_streamDonePromise');
	});

	test('IS_STREAMING_RESPONSE_KEY is defined', () => {
		expect(IS_STREAMING_RESPONSE_KEY).toBe('_isStreamingResponse');
	});
});

describe('Stream Completion Promise Pattern', () => {
	test('completion promise resolves when markDone is called', async () => {
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

		let resolved = false;
		donePromise.then(() => {
			resolved = true;
		});

		expect(resolved).toBe(false);

		markDone();

		await donePromise;
		expect(resolved).toBe(true);
	});

	test('completion promise is idempotent - markDone only resolves once', async () => {
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

	test('completion promise can reject on error', async () => {
		let rejectDone: ((reason?: unknown) => void) | undefined;
		const donePromise = new Promise<void>((_resolve, reject) => {
			rejectDone = reject;
		});

		let isDone = false;
		const markDone = (error?: unknown) => {
			if (isDone) return;
			isDone = true;
			if (error) {
				rejectDone?.(error);
			}
		};

		const testError = new Error('Test error');
		markDone(testError);

		let caughtError: unknown;
		try {
			await donePromise;
		} catch (err) {
			caughtError = err;
		}

		expect(caughtError).toBe(testError);
	});
});

describe('Deferred Save Pattern', () => {
	test('waitUntil pattern defers execution until stream completes', async () => {
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

	test('non-streaming responses save synchronously', async () => {
		const executionOrder: string[] = [];

		const finalizeSession = async () => {
			executionOrder.push('finalize');
		};

		const isStreaming = false;
		const streamDonePromise = undefined;

		if (isStreaming && streamDonePromise) {
			executionOrder.push('defer-registered');
		} else {
			await finalizeSession();
		}

		executionOrder.push('middleware-returned');

		expect(executionOrder).toEqual(['finalize', 'middleware-returned']);
	});

	test('deferred save still executes even if stream errors', async () => {
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
