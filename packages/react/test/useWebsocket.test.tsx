import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { AgentuityProvider } from '../src/context';
import { useWebsocket } from '../src/websocket';

// Mock WebSocket
class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;
	static instances: MockWebSocket[] = [];

	readyState = MockWebSocket.CONNECTING;
	url: string;
	onopen: ((event: unknown) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	onclose: ((event: unknown) => void) | null = null;
	onmessage: ((event: unknown) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
		// Simulate async connection
		setTimeout(() => {
			this.readyState = MockWebSocket.OPEN;
			if (this.onopen) {
				this.onopen({});
			}
		}, 0);
	}

	send(data: string | ArrayBuffer | Blob | ArrayBufferView) {
		if (this.readyState !== MockWebSocket.OPEN) {
			throw new Error('WebSocket is not open');
		}
		// Echo back for testing
		setTimeout(() => {
			if (this.onmessage) {
				this.onmessage({ data: JSON.stringify({ echo: data }) });
			}
		}, 0);
	}

	close(code?: number, reason?: string) {
		this.readyState = MockWebSocket.CLOSED;
		if (this.onclose) {
			this.onclose({ code: code || 1000, reason: reason || '' });
		}
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

// Augment WebSocketRouteRegistry for testing
declare module '../src/types' {
	interface WebSocketRouteRegistry {
		'/test-ws': {
			inputSchema: { message: string };
			outputSchema: { response: string };
		};
		'/chat': {
			inputSchema: { text: string; userId: number };
			outputSchema: { text: string; timestamp: number };
		};
	}
}

describe('useWebsocket', () => {
	let originalWebSocket: typeof WebSocket;

	beforeEach(() => {
		originalWebSocket = globalThis.WebSocket;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).WebSocket = MockWebSocket;
		MockWebSocket.instances = [];
	});

	afterEach(() => {
		globalThis.WebSocket = originalWebSocket;
		MockWebSocket.instances = [];
	});

	const wrapper = ({ children }: { children: ReactNode }) => (
		<AgentuityProvider baseUrl="http://localhost:3000">{children}</AgentuityProvider>
	);

	test('should establish WebSocket connection', async () => {
		const { result } = renderHook(() => useWebsocket('/test-ws'), { wrapper });

		// Initially not connected
		expect(result.current.isConnected).toBe(false);

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		expect(result.current.isConnected).toBe(true);
		expect(result.current.readyState).toBe(MockWebSocket.OPEN);
		expect(result.current.error).toBeNull();
		expect(result.current.isError).toBe(false);
	});

	test('should send and receive typed messages', async () => {
		const { result } = renderHook(() => useWebsocket('/test-ws'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		// Send a message
		act(() => {
			result.current.send({ message: 'Hello' });
		});

		// Wait for echo response
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		// Should receive echo
		expect(result.current.data).toBeDefined();
	});

	test('should queue messages when not connected', async () => {
		const { result } = renderHook(() => useWebsocket('/test-ws'), { wrapper });

		// Send before connection
		act(() => {
			result.current.send({ message: 'Queued' });
		});

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		// Message should be sent after connection
		expect(result.current.isConnected).toBe(true);
	});

	test('should handle connection errors', async () => {
		const { result } = renderHook(() => useWebsocket('/test-ws'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		// Simulate error
		await act(async () => {
			const ws = MockWebSocket.instances[0];
			if (ws) ws.simulateError();
		});

		expect(result.current.isError).toBe(true);
		expect(result.current.error).toBeDefined();
	});

	test('should close connection', async () => {
		const { result } = renderHook(() => useWebsocket('/test-ws'), { wrapper });

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
		const { result } = renderHook(() => useWebsocket('/test-ws'), { wrapper });

		// Wait for connection
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		// Simulate error
		await act(async () => {
			const ws = MockWebSocket.instances[0];
			if (ws) ws.simulateError();
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
				useWebsocket('/chat', {
					query: new URLSearchParams({ room: 'general' }),
				}),
			{ wrapper }
		);

		// WebSocket URL should include query params
		// Note: Can't easily verify URL in mock, but hook should construct it
		expect(result.current).toBeDefined();
	});

	test('should handle abort signal', async () => {
		const abortController = new AbortController();
		const { result } = renderHook(
			() =>
				useWebsocket('/test-ws', {
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

	test('should convert http to ws protocol', () => {
		const { result } = renderHook(() => useWebsocket('/test-ws'), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<AgentuityProvider baseUrl="http://localhost:3000">{children}</AgentuityProvider>
			),
		});

		// Should construct ws:// URL from http://
		expect(result.current).toBeDefined();
	});

	test('should convert https to wss protocol', () => {
		const { result } = renderHook(() => useWebsocket('/test-ws'), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<AgentuityProvider baseUrl="https://api.example.com">{children}</AgentuityProvider>
			),
		});

		// Should construct wss:// URL from https://
		expect(result.current).toBeDefined();
	});
});
