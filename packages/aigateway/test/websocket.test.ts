import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	AIGatewayWebSocketClient,
	AIGatewayWebSocketError,
	buildAIGatewayWebSocketUrl,
	parseAIGatewayWSServerFrame,
} from '../src/index.ts';

const OriginalWebSocket = globalThis.WebSocket;

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 3;
	static instances: MockWebSocket[] = [];

	readyState = MockWebSocket.CONNECTING;
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	readonly sent: string[] = [];
	readonly url: string;
	readonly headers?: Record<string, string>;

	constructor(url: string, options?: { headers?: Record<string, string> }) {
		this.url = url;
		this.headers = options?.headers;
		MockWebSocket.instances.push(this);
	}

	send(data: string) {
		this.sent.push(data);
	}

	close(code = 1000, reason = '') {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.({
			code,
			reason,
			wasClean: true,
		} as CloseEvent);
	}

	open() {
		this.readyState = MockWebSocket.OPEN;
		this.onopen?.(new Event('open'));
	}

	receive(payload: unknown) {
		this.onmessage?.({
			data: JSON.stringify(payload),
		} as MessageEvent);
	}
}

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('AI Gateway WebSocket protocol', () => {
	it('builds wss URLs from https base URLs', () => {
		expect(buildAIGatewayWebSocketUrl('https://aigateway.example')).toBe(
			'wss://aigateway.example/v1/ws'
		);
	});

	it('parses draining, error, and response frames', () => {
		expect(
			parseAIGatewayWSServerFrame({
				type: 'draining',
				message: 'shutting down',
			})
		).toEqual({
			type: 'draining',
			message: 'shutting down',
		});

		expect(
			parseAIGatewayWSServerFrame({
				type: 'error',
				id: 'req_1',
				status_code: 503,
				message: 'draining',
			})
		).toEqual({
			type: 'error',
			id: 'req_1',
			status_code: 503,
			message: 'draining',
		});

		expect(
			parseAIGatewayWSServerFrame({
				type: 'response',
				id: 'req_1',
				status: 'complete',
				content: 'hello',
				usage: { prompt: 1, completion: 2, total: 3, cached: 1 },
			})
		).toMatchObject({
			type: 'response',
			id: 'req_1',
			status: 'complete',
			content: 'hello',
		});
	});
});

describe('AIGatewayWebSocketClient', () => {
	beforeEach(() => {
		MockWebSocket.instances = [];
		globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
	});

	afterEach(() => {
		globalThis.WebSocket = OriginalWebSocket;
		MockWebSocket.instances = [];
	});

	it('connects with auth headers and completes compact requests', async () => {
		const client = new AIGatewayWebSocketClient({
			apiKey: 'ag_test',
			orgId: 'org_test',
			url: 'https://aigateway.example',
		});

		const connectPromise = client.connect();
		const ws = MockWebSocket.instances[0];
		expect(ws?.url).toBe('wss://aigateway.example/v1/ws');
		expect(ws?.headers).toEqual({
			Authorization: 'Bearer ag_test',
			'x-agentuity-orgid': 'org_test',
		});

		ws?.open();
		await connectPromise;

		const resultPromise = client.complete({
			model: 'anthropic/claude-sonnet-4-20250514',
			prompt: 'Hello',
		});
		await flushAsyncWork();

		const request = JSON.parse(ws?.sent[0] ?? '{}');
		expect(request).toMatchObject({
			type: 'request',
			compact: true,
			model: 'anthropic/claude-sonnet-4-20250514',
			prompt: 'Hello',
			stream: false,
		});

		ws?.receive({
			type: 'response',
			id: request.id,
			status: 'complete',
			content: 'Hi there',
			usage: { prompt: 10, completion: 5, total: 15, cached: 2 },
		});

		await expect(resultPromise).resolves.toEqual({
			id: request.id,
			content: 'Hi there',
			usage: { prompt: 10, completion: 5, total: 15, cached: 2 },
		});
	});

	it('streams delta and thinking frames before complete', async () => {
		const client = new AIGatewayWebSocketClient({
			apiKey: 'ag_test',
			orgId: 'org_test',
			url: 'https://aigateway.example',
		});

		const connectPromise = client.connect();
		const ws = MockWebSocket.instances[0];
		ws?.open();
		await connectPromise;

		const events: string[] = [];
		const streamPromise = (async () => {
			for await (const event of client.stream({
				model: 'anthropic/claude-sonnet-4-20250514',
				prompt: 'Hello',
				stream: true,
			})) {
				events.push(
					`${event.type}:${'delta' in event ? event.delta : 'thinking' in event ? event.thinking : event.result.content}`
				);
			}
		})();

		await flushAsyncWork();
		const request = JSON.parse(MockWebSocket.instances[0]?.sent[0] ?? '{}');

		MockWebSocket.instances[0]?.receive({
			type: 'response',
			id: request.id,
			status: 'thinking_delta',
			thinking: 'hmm',
		});
		MockWebSocket.instances[0]?.receive({
			type: 'response',
			id: request.id,
			status: 'delta',
			delta: 'Hello',
		});
		MockWebSocket.instances[0]?.receive({
			type: 'response',
			id: request.id,
			status: 'complete',
			content: 'Hello world',
		});

		await streamPromise;
		expect(events).toEqual(['thinking_delta:hmm', 'delta:Hello', 'complete:Hello world']);
	});

	it('handoffs to a new websocket while the retiring socket completes in-flight requests', async () => {
		let drainingMessage = '';
		let reconnectAttempt = 0;
		const client = new AIGatewayWebSocketClient({
			apiKey: 'ag_test',
			orgId: 'org_test',
			url: 'https://aigateway.example',
			onDraining: (message) => {
				drainingMessage = message;
			},
			onReconnect: (attempt) => {
				reconnectAttempt = attempt;
			},
		});

		const connectPromise = client.connect();
		const firstWs = MockWebSocket.instances[0];
		firstWs?.open();
		await connectPromise;

		const inFlight = client.complete({
			id: 'req_inflight',
			model: 'anthropic/claude-sonnet-4-20250514',
			prompt: 'Finish me',
		});
		await flushAsyncWork();

		firstWs?.receive({
			type: 'draining',
			message: 'server rolling restart',
		});

		expect(client.isDraining).toBe(true);
		expect(drainingMessage).toBe('server rolling restart');
		expect(client.state).toBe('reconnecting');
		expect(reconnectAttempt).toBe(1);
		expect(MockWebSocket.instances).toHaveLength(2);

		const secondWs = MockWebSocket.instances[1];
		secondWs?.open();
		await flushAsyncWork();
		expect(client.state).toBe('connected');

		const newRequestPromise = client.complete({
			id: 'req_new',
			model: 'anthropic/claude-sonnet-4-20250514',
			prompt: 'New request on fresh socket',
		});
		await flushAsyncWork();

		expect(JSON.parse(firstWs?.sent[0] ?? '{}')).toMatchObject({ id: 'req_inflight' });
		expect(JSON.parse(secondWs?.sent[0] ?? '{}')).toMatchObject({
			id: 'req_new',
			prompt: 'New request on fresh socket',
		});

		firstWs?.receive({
			type: 'response',
			id: 'req_inflight',
			status: 'complete',
			content: 'done',
		});
		secondWs?.receive({
			type: 'response',
			id: 'req_new',
			status: 'complete',
			content: 'fresh',
		});

		await expect(inFlight).resolves.toMatchObject({ content: 'done' });
		await expect(newRequestPromise).resolves.toMatchObject({ content: 'fresh' });

		firstWs?.close(1001, 'going away');
		await flushAsyncWork();
		expect(client.isDraining).toBe(false);
		expect(client.state).toBe('connected');
		expect(MockWebSocket.instances).toHaveLength(2);
	});

	it('multiplexes concurrent requests over one connection by request id', async () => {
		const client = new AIGatewayWebSocketClient({
			apiKey: 'ag_test',
			orgId: 'org_test',
			url: 'https://aigateway.example',
		});

		const connectPromise = client.connect();
		const ws = MockWebSocket.instances[0];
		ws?.open();
		await connectPromise;

		const firstPromise = client.complete({
			id: 'req_alpha',
			model: 'anthropic/claude-sonnet-4-20250514',
			prompt: 'First prompt',
		});
		const secondPromise = client.complete({
			id: 'req_beta',
			model: 'anthropic/claude-sonnet-4-20250514',
			prompt: 'Second prompt',
		});

		await flushAsyncWork();

		expect(ws?.sent).toHaveLength(2);
		expect(JSON.parse(ws?.sent[0] ?? '{}')).toMatchObject({
			type: 'request',
			id: 'req_alpha',
			prompt: 'First prompt',
		});
		expect(JSON.parse(ws?.sent[1] ?? '{}')).toMatchObject({
			type: 'request',
			id: 'req_beta',
			prompt: 'Second prompt',
		});

		// Complete responses out of order to prove routing is per-id, not FIFO.
		ws?.receive({
			type: 'response',
			id: 'req_beta',
			status: 'complete',
			content: 'Beta reply',
		});
		ws?.receive({
			type: 'response',
			id: 'req_alpha',
			status: 'complete',
			content: 'Alpha reply',
		});

		await expect(firstPromise).resolves.toMatchObject({
			id: 'req_alpha',
			content: 'Alpha reply',
		});
		await expect(secondPromise).resolves.toMatchObject({
			id: 'req_beta',
			content: 'Beta reply',
		});
	});

	it('surfaces server error frames for a request id', async () => {
		const client = new AIGatewayWebSocketClient({
			apiKey: 'ag_test',
			orgId: 'org_test',
			url: 'https://aigateway.example',
		});

		const connectPromise = client.connect();
		const ws = MockWebSocket.instances[0];
		ws?.open();
		await connectPromise;

		const resultPromise = client.complete({
			id: 'req_error',
			model: 'anthropic/claude-sonnet-4-20250514',
			prompt: 'Hello',
		});
		await flushAsyncWork();

		ws?.receive({
			type: 'error',
			id: 'req_error',
			status_code: 503,
			message: 'service draining',
		});

		await expect(resultPromise).rejects.toBeInstanceOf(AIGatewayWebSocketError);
		await expect(resultPromise).rejects.toMatchObject({
			code: 'connection_error',
			statusCode: 503,
			requestId: 'req_error',
		});
	});
});
