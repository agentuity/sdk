import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { registerDevModeRoutes } from '../src/devmode';

describe('Dev Mode Event Listener Leaks', () => {
	let initialListenerCount: number;
	let originalMaxListeners: number;

	beforeEach(() => {
		initialListenerCount = process.listenerCount('SIGINT');
		originalMaxListeners = process.getMaxListeners();
	});

	afterEach(() => {
		// Clean up any listeners added during tests
		const listeners = process.listeners('SIGINT');
		listeners.forEach((listener) => {
			process.removeListener('SIGINT', listener);
		});
		process.setMaxListeners(originalMaxListeners);
	});

	test('registerDevModeRoutes should not leak SIGINT listeners on multiple calls', () => {
		const router = new Hono();

		// Call registerDevModeRoutes multiple times (simulating multiple restarts)
		for (let i = 0; i < 15; i++) {
			registerDevModeRoutes(router);
		}

		const finalListenerCount = process.listenerCount('SIGINT');
		const listenersAdded = finalListenerCount - initialListenerCount;

		// Should only add 1 listener total, not 15
		expect(listenersAdded).toBeLessThanOrEqual(1);
	});

	test('registerDevModeRoutes should clean up listener when called again', () => {
		const router1 = new Hono();
		const router2 = new Hono();

		registerDevModeRoutes(router1);
		const afterFirst = process.listenerCount('SIGINT');

		registerDevModeRoutes(router2);
		const afterSecond = process.listenerCount('SIGINT');

		// Second call should not add another listener
		expect(afterSecond).toBe(afterFirst);
	});
});
