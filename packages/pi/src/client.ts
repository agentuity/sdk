import type { InitMessage, HubRequest, HubResponse } from './protocol.ts';

/** How long to wait for a response before rejecting the pending promise (ms). */
const SEND_TIMEOUT_MS = 30_000;

export class HubClient {
	private ws: WebSocket | null = null;
	private pending = new Map<
		string,
		{
			resolve: (resp: HubResponse) => void;
			reject: (err: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	async connect(url: string): Promise<InitMessage> {
		return new Promise((resolve, reject) => {
			// Ensure ws:// or wss:// protocol — upgrade http(s) URLs automatically
			let wsUrl = url;
			if (wsUrl.startsWith('http://')) {
				wsUrl = 'ws://' + wsUrl.slice(7);
			} else if (wsUrl.startsWith('https://')) {
				wsUrl = 'wss://' + wsUrl.slice(8);
			} else if (
				!wsUrl.startsWith('ws://') &&
				!wsUrl.startsWith('wss://')
			) {
				wsUrl = 'ws://' + wsUrl;
			}

			this.ws = new WebSocket(wsUrl);

			// Guard against duplicate init messages re-invoking the resolve
			let initResolved = false;

			this.ws.onopen = () => {
				// Wait for init message
			};

			this.ws.onmessage = (event: MessageEvent) => {
				let data: Record<string, unknown>;
				try {
					const raw =
						typeof event.data === 'string'
							? event.data
							: new TextDecoder().decode(
									event.data as ArrayBuffer,
								);
					data = JSON.parse(raw) as Record<string, unknown>;
				} catch {
					// Malformed or non-JSON frame — ignore
					return;
				}

				// First message should be init
				if (data.type === 'init' && !initResolved) {
					initResolved = true;
					resolve(data as unknown as InitMessage);
					return;
				}

				// Otherwise it's a response to a pending request
				const response = data as unknown as HubResponse;
				const entry = this.pending.get(response.id);
				if (entry) {
					clearTimeout(entry.timer);
					this.pending.delete(response.id);
					entry.resolve(response);
				}
			};

			this.ws.onerror = (err: Event) => {
				// ErrorEvent has a message property; plain Event does not
				const message =
					'message' in err &&
					typeof (err as ErrorEvent).message === 'string'
						? (err as ErrorEvent).message
						: `connection to ${wsUrl} failed`;
				reject(new Error(`WebSocket error: ${message}`));
			};

			this.ws.onclose = () => {
				// Reject all pending requests
				for (const [id, entry] of this.pending) {
					clearTimeout(entry.timer);
					entry.reject(new Error('WebSocket closed'));
					this.pending.delete(id);
				}
				this.ws = null;
			};
		});
	}

	nextId(): string {
		return crypto.randomUUID();
	}

	async send(request: HubRequest): Promise<HubResponse> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			// Return a default ACK if not connected
			return { id: request.id, actions: [{ action: 'ACK' }] };
		}

		return new Promise<HubResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				const entry = this.pending.get(request.id);
				if (entry) {
					this.pending.delete(request.id);
					entry.reject(
						new Error(
							`Hub response timeout after ${SEND_TIMEOUT_MS}ms for request ${request.id}`,
						),
					);
				}
			}, SEND_TIMEOUT_MS);

			this.pending.set(request.id, { resolve, reject, timer });
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
