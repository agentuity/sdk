import type { EventHandler, WebSocketClient } from './types';

/**
 * Create a WebSocket client wrapper with event-based API.
 */
export function createWebSocketClient(url: string, protocols?: string | string[]): WebSocketClient {
	const ws = new WebSocket(url, protocols);
	const handlers: {
		message: Set<EventHandler<unknown>>;
		open: Set<EventHandler<Event>>;
		close: Set<EventHandler<CloseEvent>>;
		error: Set<EventHandler<Event>>;
	} = {
		message: new Set(),
		open: new Set(),
		close: new Set(),
		error: new Set(),
	};

	// Set up native WebSocket event listeners
	ws.addEventListener('message', (event: MessageEvent) => {
		let data: unknown = event.data;
		// Try to parse JSON if data is a string
		if (typeof event.data === 'string') {
			try {
				data = JSON.parse(event.data);
			} catch {
				// Keep as string if not valid JSON
				data = event.data;
			}
		}
		handlers.message.forEach((handler) => handler(data));
	});

	ws.addEventListener('open', (event: Event) => {
		handlers.open.forEach((handler) => handler(event));
	});

	ws.addEventListener('close', (event: CloseEvent) => {
		handlers.close.forEach((handler) => handler(event));
	});

	ws.addEventListener('error', (event: Event) => {
		handlers.error.forEach((handler) => handler(event));
	});

	return {
		on: ((event: 'message' | 'open' | 'close' | 'error', handler: EventHandler) => {
			handlers[event].add(handler as EventHandler<unknown | Event | CloseEvent>);
		}) as WebSocketClient['on'],

		send(data: unknown) {
			const payload = typeof data === 'string' ? data : JSON.stringify(data);
			ws.send(payload);
		},

		close(code?: number, reason?: string) {
			ws.close(code, reason);
		},
	};
}
