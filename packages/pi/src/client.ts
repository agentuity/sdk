import type { InitMessage, HubRequest, HubResponse } from './protocol.ts';

export class HubClient {
	private ws: WebSocket | null = null;
	private pending = new Map<
		string,
		{ resolve: (resp: HubResponse) => void; reject: (err: Error) => void }
	>();
	private messageId = 0;

	async connect(url: string): Promise<InitMessage> {
		return new Promise((resolve, reject) => {
			// Ensure ws:// or wss:// protocol — upgrade http(s) URLs automatically
			let wsUrl = url;
			if (wsUrl.startsWith('http://')) {
				wsUrl = 'ws://' + wsUrl.slice(7);
			} else if (wsUrl.startsWith('https://')) {
				wsUrl = 'wss://' + wsUrl.slice(8);
			} else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
				wsUrl = 'ws://' + wsUrl;
			}

			this.ws = new WebSocket(wsUrl);

			this.ws.onopen = () => {
				// Wait for init message
			};

			this.ws.onmessage = (event) => {
				const data = JSON.parse(
					typeof event.data === 'string'
						? event.data
						: new TextDecoder().decode(event.data as ArrayBuffer),
				);

				// First message should be init
				if (data.type === 'init') {
					resolve(data as InitMessage);
					return;
				}

				// Otherwise it's a response to a pending request
				const response = data as HubResponse;
				const pending = this.pending.get(response.id);
				if (pending) {
					this.pending.delete(response.id);
					pending.resolve(response);
				}
			};

			this.ws.onerror = (err: Event) => {
				// ErrorEvent has a message property; plain Event does not
				const message =
					'message' in err && typeof (err as any).message === 'string'
						? (err as any).message
						: `connection to ${wsUrl} failed`;
				reject(new Error(`WebSocket error: ${message}`));
			};

			this.ws.onclose = () => {
				// Reject all pending requests
				for (const [id, { reject }] of this.pending) {
					reject(new Error('WebSocket closed'));
					this.pending.delete(id);
				}
				this.ws = null;
			};
		});
	}

	nextId(): string {
		return String(++this.messageId);
	}

	async send(request: HubRequest): Promise<HubResponse> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			// Return a default ACK if not connected
			return { id: request.id, actions: [{ action: 'ACK' }] };
		}

		return new Promise((resolve, reject) => {
			this.pending.set(request.id, { resolve, reject });
			this.ws!.send(JSON.stringify(request));
		});
	}

	close(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	get connected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}
}
