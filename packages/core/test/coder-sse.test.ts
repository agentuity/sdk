import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { CoderSSEClient, streamCoderSessionSSE } from '../src/services/coder/sse.ts';

const OriginalEventSource = globalThis.EventSource;

type MockListener = (event: Event) => void;

class MockEventSource {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 2;
	static instances: MockEventSource[] = [];

	readyState = MockEventSource.CONNECTING;
	onopen: ((event: Event) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	readonly url: string;
	readonly listeners = new Map<string, MockListener[]>();

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	addEventListener(eventName: string, listener: MockListener) {
		const existing = this.listeners.get(eventName) ?? [];
		existing.push(listener);
		this.listeners.set(eventName, existing);
	}

	close() {
		this.readyState = MockEventSource.CLOSED;
	}

	open() {
		this.readyState = MockEventSource.OPEN;
		this.onopen?.(new Event('open'));
	}

	emit(eventName: string, payload: unknown) {
		const listeners = this.listeners.get(eventName) ?? [];
		const event = {
			data: JSON.stringify(payload),
		} as MessageEvent;
		for (const listener of listeners) {
			listener(event);
		}
	}
}

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('Coder SSE observer clients', () => {
	beforeEach(() => {
		MockEventSource.instances = [];
		globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
	});

	afterEach(() => {
		globalThis.EventSource = OriginalEventSource;
		MockEventSource.instances = [];
	});

	it('uses default observer subscriptions unless explicit filters are provided', async () => {
		let openCount = 0;
		const client = new CoderSSEClient({
			apiKey: 'ag_test',
			orgId: 'org_test',
			url: 'https://hub.example',
			sessionId: 'codesess_sse_default',
			reconnect: false,
			onOpen: () => {
				openCount += 1;
			},
		});

		client.connect();
		await flushAsyncWork();

		const eventSource = MockEventSource.instances[0];
		expect(eventSource).toBeDefined();
		expect(decodeURIComponent(eventSource!.url)).toContain(
			'/api/hub/session/codesess_sse_default/events'
		);
		expect(decodeURIComponent(eventSource!.url)).toContain('api_key=ag_test');
		expect(decodeURIComponent(eventSource!.url)).toContain('org_id=org_test');
		expect(decodeURIComponent(eventSource!.url)).not.toContain('subscribe=');

		eventSource!.open();
		expect(client.state).toBe('connected');
		expect(openCount).toBe(1);
	});

	it('streams broadcast events when explicit raw-event subscriptions are requested', async () => {
		const eventsPromise = (async () => {
			const seen = [];
			for await (const event of streamCoderSessionSSE({
				url: 'https://hub.example',
				sessionId: 'codesess_sse_stream',
				subscribe: ['*'],
				reconnect: false,
			})) {
				seen.push(event);
				break;
			}
			return seen;
		})();

		await flushAsyncWork();

		const eventSource = MockEventSource.instances[0];
		expect(eventSource).toBeDefined();
		expect(decodeURIComponent(eventSource!.url)).toContain('subscribe=*');

		eventSource!.open();
		eventSource!.emit('broadcast', {
			event: 'message_update',
			data: {
				assistantMessageEvent: {
					type: 'text_delta',
					delta: 'hello from SSE',
				},
			},
			category: 'streaming',
			sessionId: 'codesess_sse_stream',
			timestamp: Date.now(),
		});

		const events = await eventsPromise;
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			event: 'broadcast',
			data: {
				type: 'broadcast',
				event: 'message_update',
				category: 'streaming',
				sessionId: 'codesess_sse_stream',
			},
		});
		expect(eventSource!.readyState).toBe(MockEventSource.CLOSED);
	});
});
