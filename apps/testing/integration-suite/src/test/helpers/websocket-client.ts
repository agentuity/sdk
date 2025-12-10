/**
 * WebSocket Client Helper for Tests
 *
 * Provides utilities for testing WebSocket endpoints.
 */

export class WebSocketTestClient {
	private ws: WebSocket | null = null;
	private messageQueue: any[] = [];
	private closePromise: Promise<void> | null = null;
	private closeResolve: (() => void) | null = null;

	constructor(private url: string) {}

	/**
	 * Connect to the WebSocket server
	 */
	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket(this.url);

			this.ws.onopen = () => {
				resolve();
			};

			this.ws.onerror = (error) => {
				reject(error);
			};

			this.ws.onmessage = (event) => {
				this.messageQueue.push(event.data);
			};

			// Setup close promise
			this.closePromise = new Promise((res) => {
				this.closeResolve = res;
			});

			this.ws.onclose = () => {
				if (this.closeResolve) {
					this.closeResolve();
				}
			};
		});
	}

	/**
	 * Send a message to the WebSocket server
	 */
	send(data: string | object): void {
		if (!this.ws) {
			throw new Error('WebSocket not connected');
		}

		const message = typeof data === 'string' ? data : JSON.stringify(data);
		this.ws.send(message);
	}

	/**
	 * Wait for and receive the next message
	 */
	async receive(timeoutMs: number = 5000): Promise<any> {
		const startTime = Date.now();

		while (this.messageQueue.length === 0) {
			if (Date.now() - startTime > timeoutMs) {
				throw new Error(`Timeout waiting for message after ${timeoutMs}ms`);
			}

			// Wait a bit before checking again
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		return this.messageQueue.shift();
	}

	/**
	 * Receive a message and parse as JSON
	 */
	async receiveJSON(timeoutMs: number = 5000): Promise<any> {
		const message = await this.receive(timeoutMs);
		return JSON.parse(message);
	}

	/**
	 * Get all pending messages without waiting
	 */
	getPendingMessages(): any[] {
		const messages = [...this.messageQueue];
		this.messageQueue = [];
		return messages;
	}

	/**
	 * Close the WebSocket connection
	 */
	async close(): Promise<void> {
		if (this.ws) {
			this.ws.close();
			await this.closePromise;
			this.ws = null;
		}
	}

	/**
	 * Check if the WebSocket is connected
	 */
	isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}
}

/**
 * Create a WebSocket client for testing
 */
export function createWebSocketClient(path: string): WebSocketTestClient {
	const baseUrl = 'ws://localhost:3500';
	const url = `${baseUrl}${path}`;
	return new WebSocketTestClient(url);
}
