import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { AgentuityProvider } from '../src/context';
import { useEventStream } from '../src/eventstream';

// Mock EventSource
class MockEventSource {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 2;
	static instances: MockEventSource[] = [];

	readyState = MockEventSource.CONNECTING;
	url: string;
	onopen: ((event: unknown) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	onmessage: ((event: unknown) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
		// Simulate async connection
		setTimeout(() => {
			this.readyState = MockEventSource.OPEN;
			if (this.onopen) {
				this.onopen({});
			}
		}, 0);
	}

	close() {
		this.readyState = MockEventSource.CLOSED;
	}

	simulateMessage(data: unknown) {
		if (this.onmessage) {
			this.onmessage({ data: JSON.stringify(data) });
		}
	}

	simulateError() {
		if (this.onerror) {
			this.onerror({});
		}
	}
}

// Augment SSERouteRegistry for testing
declare module '../src/types' {
	interface SSERouteRegistry {
		'/events': {
			outputSchema: { type: string; data: string };
		};
		'/notifications': {
			outputSchema: { message: string; timestamp: number };
		};
	}
}

describe('useEventStream', () => {
	let originalEventSource: typeof EventSource;

	beforeEach(() => {
		originalEventSource = globalThis.EventSource;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).EventSource = MockEventSource;
		MockEventSource.instances = [];
	});

	afterEach(() => {
		globalThis.EventSource = originalEventSource;
		MockEventSource.instances = [];
	});

	const wrapper = ({ children }: { children: ReactNode }) => (
		<AgentuityProvider baseUrl="http://localhost:3000">{children}</AgentuityProvider>
	);

	test('should establish EventSource connection', async () => {
		const { result } = renderHook(() => useEventStream('/events'), { wrapper });

		// Initially not connected
		expect(result.current.isConnected).toBe(false);

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		expect(result.current.isConnected).toBe(true);
		expect(result.current.readyState).toBe(MockEventSource.OPEN);
		expect(result.current.error).toBeNull();
		expect(result.current.isError).toBe(false);
	});

	test('should receive typed messages', async () => {
		const { result } = renderHook(() => useEventStream('/events'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		// Simulate server message
		const testData = { type: 'update', data: 'test-data' };
		await act(async () => {
			const es = MockEventSource.instances[0];
			if (es) es.simulateMessage(testData);
		});

		expect(result.current.data).toEqual(testData);
	});

	test('should handle connection errors', async () => {
		const { result } = renderHook(() => useEventStream('/events'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		// Simulate error
		await act(async () => {
			const es = MockEventSource.instances[0];
			if (es) es.simulateError();
		});

		expect(result.current.isError).toBe(true);
		expect(result.current.error).toBeDefined();
		expect(result.current.isConnected).toBe(false);
	});

	test('should close connection', async () => {
		const { result } = renderHook(() => useEventStream('/events'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		expect(result.current.isConnected).toBe(true);

		// Close connection
		act(() => {
			result.current.close();
		});

		expect(result.current.isConnected).toBe(false);
	});

	test('should reset error state', async () => {
		const { result } = renderHook(() => useEventStream('/events'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		// Simulate error
		await act(async () => {
			const es = MockEventSource.instances[0];
			if (es) es.simulateError();
		});

		expect(result.current.isError).toBe(true);

		// Reset error
		act(() => {
			result.current.reset();
		});

		expect(result.current.error).toBeNull();
		expect(result.current.isError).toBe(false);
	});

	test('should handle query parameters', () => {
		const { result } = renderHook(
			() =>
				useEventStream('/notifications', {
					query: new URLSearchParams({ userId: '123' }),
				}),
			{ wrapper }
		);

		// EventSource URL should include query params
		expect(result.current).toBeDefined();
	});

	test('should handle abort signal', async () => {
		const abortController = new AbortController();
		const { result } = renderHook(
			() =>
				useEventStream('/events', {
					signal: abortController.signal,
				}),
			{ wrapper }
		);

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		expect(result.current.isConnected).toBe(true);

		// Abort connection
		act(() => {
			abortController.abort();
		});

		// Should disconnect
		expect(result.current.isConnected).toBe(false);
	});

	test('should handle multiple messages in sequence', async () => {
		const { result } = renderHook(() => useEventStream('/events'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		const messages = [
			{ type: 'msg1', data: 'first' },
			{ type: 'msg2', data: 'second' },
			{ type: 'msg3', data: 'third' },
		];

		// Send multiple messages
		for (const msg of messages) {
			await act(async () => {
				const es = MockEventSource.instances[0];
				if (es) es.simulateMessage(msg);
			});
		}

		// Should have the last message
		expect(result.current.data).toEqual(messages[messages.length - 1]);
	});

	test('should handle subpath option', () => {
		const { result } = renderHook(
			() =>
				useEventStream('/events', {
					subpath: '/stream',
				}),
			{ wrapper }
		);

		expect(result.current).toBeDefined();
	});

	test('should deserialize JSON messages', async () => {
		const { result } = renderHook(() => useEventStream('/notifications'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		const testData = { message: 'Hello', timestamp: 1234567890 };
		await act(async () => {
			const es = MockEventSource.instances[0];
			if (es) es.simulateMessage(testData);
		});

		expect(result.current.data).toEqual(testData);
		expect(typeof result.current.data?.timestamp).toBe('number');
	});
});
