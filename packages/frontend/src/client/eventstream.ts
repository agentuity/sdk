import type { EventHandler, EventStreamClient } from './types';

/**
 * Create an EventSource (SSE) client wrapper with event-based API.
 *
 * Note: Native EventSource has limited authentication support.
 * - withCredentials: true will send cookies and HTTP auth headers
 * - For custom Authorization headers, consider using @microsoft/fetch-event-source
 */
export function createEventStreamClient(
	url: string,
	options?: { withCredentials?: boolean }
): EventStreamClient {
	const eventSource = new EventSource(url, {
		withCredentials: options?.withCredentials ?? false,
	});
	const handlers: {
		message: Set<EventHandler<MessageEvent>>;
		open: Set<EventHandler<Event>>;
		error: Set<EventHandler<Event>>;
	} = {
		message: new Set(),
		open: new Set(),
		error: new Set(),
	};

	// Set up native EventSource event listeners
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	eventSource.onmessage = (event: any) => {
		handlers.message.forEach((handler) => handler(event));
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	eventSource.onopen = (event: any) => {
		handlers.open.forEach((handler) => handler(event));
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	eventSource.onerror = (event: any) => {
		handlers.error.forEach((handler) => handler(event));
	};

	return {
		on: ((event: 'message' | 'open' | 'error', handler: EventHandler) => {
			handlers[event].add(handler);
		}) as EventStreamClient['on'],

		close() {
			eventSource.close();
		},
	};
}
