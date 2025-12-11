/**
 * SSE (Server-Sent Events) Client Helper for Tests
 *
 * Provides utilities for testing SSE endpoints.
 * Uses fetch with text/event-stream parsing since EventSource isn't available in Bun runtime.
 */

export interface SSEMessage {
	event?: string;
	data: string;
	id?: string;
}

export class SSETestClient {
	private messages: SSEMessage[] = [];
	private abortController: AbortController | null = null;
	private connectionActive = false;
	private eventListeners: Map<string, ((data: any) => void)[]> = new Map();

	constructor(private url: string) {}

	/**
	 * Parse SSE message from text
	 */
	private parseSSEMessage(text: string): SSEMessage | null {
		const lines = text.split('\n');
		const message: SSEMessage = { data: '' };

		for (const line of lines) {
			if (line.startsWith('event:')) {
				message.event = line.slice(6).trim();
			} else if (line.startsWith('data:')) {
				if (message.data) message.data += '\n';
				message.data += line.slice(5).trim();
			} else if (line.startsWith('id:')) {
				message.id = line.slice(3).trim();
			}
		}

		return message.data ? message : null;
	}

	/**
	 * Connect to the SSE endpoint
	 */
	async connect(): Promise<void> {
		this.abortController = new AbortController();
		this.connectionActive = true;

		const response = await fetch(this.url, {
			headers: {
				Accept: 'text/event-stream',
			},
			signal: this.abortController.signal,
		});

		if (!response.ok) {
			throw new Error(`SSE connection failed: ${response.status}`);
		}

		if (!response.body) {
			throw new Error('SSE response has no body');
		}

		// Start reading the stream
		this.readStream(response.body);
	}

	/**
	 * Read and parse the SSE stream
	 */
	private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (this.connectionActive) {
				const { done, value } = await reader.read();

				if (done) {
					this.connectionActive = false;
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				// Split by double newline (SSE message separator)
				const parts = buffer.split('\n\n');
				buffer = parts.pop() || ''; // Keep incomplete message in buffer

				for (const part of parts) {
					if (!part.trim()) continue;

					const message = this.parseSSEMessage(part);
					if (message) {
						this.messages.push(message);

						// Call event listeners
						const eventType = message.event || 'message';
						const listeners = this.eventListeners.get(eventType) || [];
						for (const listener of listeners) {
							try {
								const data = JSON.parse(message.data);
								listener(data);
							} catch {
								listener(message.data);
							}
						}
					}
				}
			}
		} catch (error) {
			if (this.connectionActive) {
				// Only throw if not deliberately closed
				throw error;
			}
		} finally {
			reader.releaseLock();
		}
	}

	/**
	 * Listen for a specific event type
	 */
	addEventListener(eventType: string, handler?: (data: any) => void): void {
		if (handler) {
			if (!this.eventListeners.has(eventType)) {
				this.eventListeners.set(eventType, []);
			}
			this.eventListeners.get(eventType)!.push(handler);
		} else {
			// Just register the event type so messages are captured
			if (!this.eventListeners.has(eventType)) {
				this.eventListeners.set(eventType, []);
			}
		}
	}

	/**
	 * Wait for and receive the next message
	 */
	async receive(timeoutMs: number = 5000): Promise<SSEMessage> {
		const startTime = Date.now();

		while (this.messages.length === 0) {
			if (Date.now() - startTime > timeoutMs) {
				throw new Error(`Timeout waiting for SSE message after ${timeoutMs}ms`);
			}

			// Wait a bit before checking again
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		return this.messages.shift()!;
	}

	/**
	 * Receive a message and parse data as JSON
	 */
	async receiveJSON(timeoutMs: number = 5000): Promise<any> {
		const message = await this.receive(timeoutMs);
		return JSON.parse(message.data);
	}

	/**
	 * Wait for a specific event type
	 */
	async receiveEvent(eventType: string, timeoutMs: number = 5000): Promise<SSEMessage> {
		const startTime = Date.now();

		while (true) {
			// Check existing messages
			const index = this.messages.findIndex((msg) => msg.event === eventType);
			if (index !== -1) {
				return this.messages.splice(index, 1)[0];
			}

			if (Date.now() - startTime > timeoutMs) {
				throw new Error(`Timeout waiting for event '${eventType}' after ${timeoutMs}ms`);
			}

			// Wait a bit before checking again
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}

	/**
	 * Get all pending messages without waiting
	 */
	getPendingMessages(): SSEMessage[] {
		const messages = [...this.messages];
		this.messages = [];
		return messages;
	}

	/**
	 * Wait for a specific number of messages
	 */
	async receiveMultiple(count: number, timeoutMs: number = 5000): Promise<SSEMessage[]> {
		const startTime = Date.now();
		const collected: SSEMessage[] = [];

		while (collected.length < count) {
			if (Date.now() - startTime > timeoutMs) {
				throw new Error(
					`Timeout waiting for ${count} messages (received ${collected.length}) after ${timeoutMs}ms`
				);
			}

			if (this.messages.length > 0) {
				collected.push(this.messages.shift()!);
			} else {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}

		return collected;
	}

	/**
	 * Close the SSE connection
	 */
	close(): void {
		this.connectionActive = false;
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	/**
	 * Check if the SSE connection is open
	 */
	isOpen(): boolean {
		return this.connectionActive;
	}
}

/**
 * Create an SSE client for testing
 */
export function createSSEClient(path: string, query?: Record<string, string>): SSETestClient {
	const baseUrl = 'http://localhost:3500';
	let url = `${baseUrl}${path}`;

	if (query) {
		const params = new URLSearchParams(query);
		url += `?${params.toString()}`;
	}

	return new SSETestClient(url);
}
