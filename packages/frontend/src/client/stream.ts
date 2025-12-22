import type { EventHandler, StreamClient } from './types';

/**
 * Create a streaming response reader with event-based API.
 */
export function createStreamClient(response: Response): StreamClient {
	const handlers: {
		chunk: Set<EventHandler<Uint8Array>>;
		close: Set<EventHandler<void>>;
		error: Set<EventHandler<Error>>;
	} = {
		chunk: new Set(),
		close: new Set(),
		error: new Set(),
	};

	const reader = response.body?.getReader();
	let cancelled = false;

	// Start reading the stream
	const readStream = async () => {
		if (!reader) {
			const error = new Error('Response body is not readable');
			handlers.error.forEach((handler) => handler(error));
			return;
		}

		try {
			while (!cancelled) {
				const { done, value } = await reader.read();

				if (done) {
					handlers.close.forEach((handler) => handler());
					break;
				}

				if (value) {
					handlers.chunk.forEach((handler) => handler(value));
				}
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			handlers.error.forEach((handler) => handler(err));
		}
	};

	// Start reading immediately
	readStream();

	return {
		on: ((event: 'chunk' | 'close' | 'error', handler: EventHandler) => {
			handlers[event].add(handler as EventHandler<Uint8Array | void | Error>);
		}) as StreamClient['on'],

		async cancel() {
			cancelled = true;
			await reader?.cancel();
			handlers.close.forEach((handler) => handler());
		},
	};
}
