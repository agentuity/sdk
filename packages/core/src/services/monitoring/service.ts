import { z } from 'zod';
import { APIResponseSchema } from '../api.ts';
import type { APIClient } from '../api.ts';
import type {
	ContainerMetrics,
	MachineMonitorState,
	MonitorMessage,
	MonitorScope,
	MonitorUpdate,
	MonitorWebSocketOptions,
	MonitorWebSocketState,
	StreamHealth,
} from './types.ts';

const MachineMonitorStateSchema = z.custom<MachineMonitorState>();
const ContainerMetricsSchema = z.custom<ContainerMetrics>();

const MonitorNodesListResponseSchema = APIResponseSchema(z.array(MachineMonitorStateSchema));
const MonitorNodeGetResponseSchema = APIResponseSchema(MachineMonitorStateSchema);
const MonitorNodeContainersResponseSchema = APIResponseSchema(z.array(ContainerMetricsSchema));

export async function listMonitorNodes(client: APIClient): Promise<MachineMonitorState[]> {
	const resp = await client.get(`/monitor/nodes`, MonitorNodesListResponseSchema);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message || 'Failed to list monitor nodes');
}

export async function getMonitorNode(
	client: APIClient,
	machineId: string
): Promise<MachineMonitorState> {
	const resp = await client.get(`/monitor/nodes/${machineId}`, MonitorNodeGetResponseSchema);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message || 'Failed to get monitor node');
}

export async function listDistressedNodes(client: APIClient): Promise<MachineMonitorState[]> {
	const resp = await client.get(`/monitor/nodes/distressed`, MonitorNodesListResponseSchema);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message || 'Failed to list distressed monitor nodes');
}

export async function listMonitorNodeContainers(
	client: APIClient,
	machineId: string
): Promise<ContainerMetrics[]> {
	const resp = await client.get(
		`/monitor/nodes/${machineId}/containers`,
		MonitorNodeContainersResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new Error(resp.message || 'Failed to list monitor containers');
}

function toWsUrl(baseUrl: string): string {
	const wsUrl = baseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
	return `${wsUrl.replace(/\/$/, '')}/monitor/ws`;
}

function toScopeMessage(scope: MonitorScope) {
	if (scope.scope === 'machine') {
		return {
			type: 'subscribe',
			scope: 'machine',
			machine_id: scope.machineId,
		};
	}
	if (scope.scope === 'deployment') {
		return {
			type: 'subscribe',
			scope: 'deployment',
			deployment_id: scope.deploymentId,
		};
	}
	return {
		type: 'subscribe',
		scope: 'org',
	};
}

function toStreamHealth(value: unknown): StreamHealth {
	if (value === 'CONNECTED' || value === 'STALE' || value === 'DISCONNECTED') {
		return value;
	}
	return 'DISCONNECTED';
}

function parseMessage(raw: unknown): MonitorMessage | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const data = raw as Record<string, unknown>;
	const type = data.type;
	if (type === 'snapshot') {
		return {
			type: 'snapshot',
			machines: (data.machines as MachineMonitorState[]) ?? [],
		};
	}

	if (type === 'update') {
		return {
			type: 'update',
			machineId: (data.machineId as string) ?? (data.machine_id as string) ?? '',
			health: toStreamHealth(data.health),
			report: data.report as MonitorUpdate['report'],
		};
	}

	if (type === 'state_change') {
		return {
			type: 'state_change',
			machineId: (data.machineId as string) ?? (data.machine_id as string) ?? '',
			health: toStreamHealth(data.health),
			previousHealth: toStreamHealth(data.previousHealth ?? data.previous_health),
		};
	}

	return null;
}

export class MonitorWebSocketClient {
	#options: MonitorWebSocketOptions;
	#state: MonitorWebSocketState = 'closed';
	#ws: WebSocket | null = null;
	#reconnectAttempts = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#intentionallyClosed = false;

	constructor(options: MonitorWebSocketOptions) {
		this.#options = options;
	}

	get state(): MonitorWebSocketState {
		return this.#state;
	}

	connect() {
		this.#intentionallyClosed = false;
		this.#connectInternal();
	}

	close() {
		this.#intentionallyClosed = true;
		if (this.#reconnectTimer !== null) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = null;
		}
		if (this.#ws) {
			this.#ws.close(1000, 'Client closed');
			this.#ws = null;
		}
		this.#state = 'closed';
	}

	updateScope(scope: MonitorScope) {
		this.#options.scope = scope;
		if (this.#state === 'connected' && this.#ws?.readyState === WebSocket.OPEN) {
			this.#ws.send(JSON.stringify(toScopeMessage(scope)));
		}
	}

	#connectInternal() {
		const {
			baseUrl,
			token,
			orgId,
			scope = { scope: 'org' },
			autoReconnect = true,
			maxReconnectAttempts = Number.POSITIVE_INFINITY,
			reconnectDelayMs = 1000,
			maxReconnectDelayMs = 30000,
			onClose,
			onError,
			onMessage,
			onOpen,
			onSnapshot,
			onStateChange,
			onUpdate,
		} = this.#options;

		if (this.#intentionallyClosed) {
			return;
		}

		this.#state = this.#reconnectAttempts > 0 ? 'reconnecting' : 'connecting';

		try {
			this.#ws = new WebSocket(toWsUrl(baseUrl));
		} catch (error) {
			this.#state = 'closed';
			onError?.(new Error(`Failed to create monitor WebSocket: ${String(error)}`));
			this.#scheduleReconnect(
				autoReconnect,
				maxReconnectAttempts,
				reconnectDelayMs,
				maxReconnectDelayMs,
				onError
			);
			return;
		}

		let authenticated = false;

		this.#ws.onopen = () => {
			this.#state = 'authenticating';
			this.#ws?.send(JSON.stringify({ token, org_id: orgId }));
		};

		this.#ws.onmessage = (event: MessageEvent) => {
			const rawText = typeof event.data === 'string' ? event.data : String(event.data);
			let parsed: unknown;
			try {
				parsed = JSON.parse(rawText);
			} catch {
				return;
			}

			if (!authenticated) {
				authenticated = true;
				this.#state = 'subscribing';
				this.#ws?.send(JSON.stringify(toScopeMessage(scope)));
				this.#state = 'connected';
				this.#reconnectAttempts = 0;
				onOpen?.();
				return;
			}

			const message = parseMessage(parsed);
			if (!message) {
				return;
			}

			onMessage?.(message);
			if (message.type === 'snapshot') {
				onSnapshot?.(message);
			} else if (message.type === 'update') {
				onUpdate?.(message);
			} else {
				onStateChange?.(message);
			}
		};

		this.#ws.onerror = () => {
			onError?.(new Error('Monitor WebSocket connection error'));
		};

		this.#ws.onclose = (event: CloseEvent) => {
			this.#ws = null;
			this.#state = 'closed';
			onClose?.(event.code, event.reason);

			if (event.code >= 4000 && event.code < 5000) {
				this.#intentionallyClosed = true;
			}

			if (!this.#intentionallyClosed) {
				this.#scheduleReconnect(
					autoReconnect,
					maxReconnectAttempts,
					reconnectDelayMs,
					maxReconnectDelayMs,
					onError
				);
			}
		};
	}

	#scheduleReconnect(
		autoReconnect: boolean,
		maxReconnectAttempts: number,
		reconnectDelayMs: number,
		maxReconnectDelayMs: number,
		onError?: (error: Error) => void
	) {
		if (this.#intentionallyClosed || !autoReconnect) {
			return;
		}

		if (this.#reconnectAttempts >= maxReconnectAttempts) {
			onError?.(
				new Error(`Exceeded max monitor reconnection attempts (${maxReconnectAttempts})`)
			);
			return;
		}

		const baseDelay = reconnectDelayMs * 2 ** this.#reconnectAttempts;
		const jitter = 0.5 + Math.random() * 0.5;
		const delay = Math.min(Math.floor(baseDelay * jitter), maxReconnectDelayMs);

		this.#reconnectAttempts++;
		this.#state = 'reconnecting';
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			this.#connectInternal();
		}, delay);
	}
}

export async function* subscribeToMonitoring(
	options: MonitorWebSocketOptions
): AsyncGenerator<MonitorMessage, void, unknown> {
	const buffer: MonitorMessage[] = [];
	let resolve: (() => void) | null = null;
	let done = false;
	let terminalError: Error | null = null;

	const wake = () => {
		if (resolve) {
			resolve();
			resolve = null;
		}
	};

	const client = new MonitorWebSocketClient({
		...options,
		onMessage: (message) => {
			buffer.push(message);
			wake();
		},
		onError: (error) => {
			terminalError = error;
			done = true;
			wake();
		},
		onClose: (code) => {
			if (code >= 4000 && code < 5000) {
				done = true;
				wake();
			}
		},
	});

	client.connect();

	try {
		while (!done) {
			while (buffer.length > 0) {
				const message = buffer.shift();
				if (message) {
					yield message;
				}
			}

			if (done) {
				break;
			}

			await new Promise<void>((r) => {
				resolve = r;
			});
		}

		while (buffer.length > 0) {
			const message = buffer.shift();
			if (message) {
				yield message;
			}
		}

		if (terminalError) {
			throw terminalError;
		}
	} finally {
		client.close();
	}
}
