import { z } from 'zod';
import { StructuredError } from '../../error.ts';
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

// ---------------------------------------------------------------------------
// Zod schemas mirroring every interface in types.ts
// ---------------------------------------------------------------------------

const CpuMetricsSchema = z.object({
	usagePercent: z.number().describe('Aggregate CPU usage as a 0-1 fraction'),
	coreUsagePercent: z.array(z.number()).describe('Per-core CPU usage as 0-1 fractions'),
	loadAvg1: z.number().describe('1-minute load average'),
	loadAvg5: z.number().describe('5-minute load average'),
	loadAvg15: z.number().describe('15-minute load average'),
	coreCount: z.number().describe('Number of CPU cores'),
});

const MemoryMetricsSchema = z.object({
	totalBytes: z.number().describe('Total physical memory in bytes'),
	usedBytes: z.number().describe('Used memory in bytes'),
	availableBytes: z.number().describe('Available memory in bytes'),
	cachedBytes: z.number().describe('Cached memory in bytes'),
	buffersBytes: z.number().describe('Buffer memory in bytes'),
	swapTotalBytes: z.number().describe('Total swap space in bytes'),
	swapUsedBytes: z.number().describe('Used swap space in bytes'),
	usagePercent: z.number().describe('Memory usage as a percentage'),
});

const DiskMetricsSchema = z.object({
	mountPoint: z.string().describe('Filesystem mount point'),
	device: z.string().describe('Block device name'),
	fsType: z.string().describe('Filesystem type (ext4, xfs, etc.)'),
	totalBytes: z.number().describe('Total disk capacity in bytes'),
	usedBytes: z.number().describe('Used disk space in bytes'),
	availableBytes: z.number().describe('Available disk space in bytes'),
	usagePercent: z.number().describe('Disk usage as a percentage'),
	inodesTotal: z.number().describe('Total number of inodes'),
	inodesUsed: z.number().describe('Number of used inodes'),
	readBytesDelta: z.number().describe('Bytes read since last report'),
	writeBytesDelta: z.number().describe('Bytes written since last report'),
	readOpsDelta: z.number().describe('Read operations since last report'),
	writeOpsDelta: z.number().describe('Write operations since last report'),
});

const NetworkInterfaceMetricsSchema = z.object({
	name: z.string().describe('Network interface name'),
	rxBytesDelta: z.number().describe('Bytes received since last report'),
	txBytesDelta: z.number().describe('Bytes transmitted since last report'),
	rxPacketsDelta: z.number().describe('Packets received since last report'),
	txPacketsDelta: z.number().describe('Packets transmitted since last report'),
	rxErrorsDelta: z.number().describe('Receive errors since last report'),
	txErrorsDelta: z.number().describe('Transmit errors since last report'),
	rxDropsDelta: z.number().describe('Receive drops since last report'),
	txDropsDelta: z.number().describe('Transmit drops since last report'),
	linkState: z.string().describe('Network link state (up, down, etc.)'),
	speedMbps: z.number().describe('Link speed in Mbps'),
});

const SystemInfoSchema = z.object({
	hostname: z.string().describe('Machine hostname'),
	kernelVersion: z.string().describe('Linux kernel version'),
	os: z.string().describe('Operating system name'),
	arch: z.string().describe('CPU architecture (amd64, arm64, etc.)'),
	uptimeSeconds: z.number().describe('System uptime in seconds'),
	cpuCount: z.number().describe('Number of CPU cores'),
	totalMemoryBytes: z.number().describe('Total physical memory in bytes'),
});

const HostMetricsSchema = z.object({
	cpu: CpuMetricsSchema.describe('CPU metrics'),
	memory: MemoryMetricsSchema.describe('Memory metrics'),
	disks: z.array(DiskMetricsSchema).describe('Per-disk metrics'),
	networkInterfaces: z
		.array(NetworkInterfaceMetricsSchema)
		.describe('Per-interface network metrics'),
	system: SystemInfoSchema.describe('Static system information'),
});

const CapacitySummarySchema = z.object({
	cpuPressure: z.number().describe('CPU pressure score (0-1, higher = more pressure)'),
	memoryPressure: z.number().describe('Memory pressure score (0-1, higher = more pressure)'),
	diskPressure: z.number().describe('Disk pressure score (0-1, higher = more pressure)'),
	networkPressure: z.number().describe('Network pressure score (0-1, higher = more pressure)'),
	compositeScore: z
		.number()
		.describe('Weighted composite pressure score (0-1, higher = more pressure)'),
	totalContainers: z.number().describe('Total number of containers on the node'),
	runningContainers: z.number().describe('Number of currently running containers'),
});

const NodeEventLevelSchema = z
	.enum(['UNSPECIFIED', 'INFO', 'WARN', 'ERROR', 'CRITICAL'])
	.describe('Severity level of a node event');

const NodeEventTypeSchema = z
	.enum([
		'UNSPECIFIED',
		'CONTAINER_START',
		'CONTAINER_STOP',
		'CONTAINER_OOM',
		'CONTAINER_HEALTH_CHANGE',
		'PRESSURE_THRESHOLD',
		'DISK_NEARLY_FULL',
		'COLLECTOR_ERROR',
		'PRESSURE_ALERT',
		'HEALTH_ALERT',
	])
	.describe('Type of node event');

const NodeEventSchema = z.object({
	timestampUs: z.number().describe('Event timestamp in microseconds since epoch'),
	level: NodeEventLevelSchema.describe('Event severity level'),
	type: NodeEventTypeSchema.describe('Event type'),
	message: z.string().describe('Human-readable event description'),
	metadata: z.record(z.string(), z.string()).describe('Key-value metadata attached to the event'),
});

const ContainerMetricsSchema = z.object({
	deploymentId: z
		.string()
		.describe('Deployment or sandbox ID identifying what the container runs'),
	containerId: z.string().describe('Docker container ID'),
	image: z.string().describe('Container image name'),
	state: z.string().describe('Container state (running, stopped, etc.)'),
	cpuUsagePercent: z.number().describe('Container CPU usage as a percentage'),
	cpuThrottledPeriods: z.number().describe('Number of CPU throttled periods'),
	cpuTotalPeriods: z.number().describe('Total number of CPU scheduling periods'),
	cpuLimitMillicores: z.number().describe('CPU limit in millicores'),
	memoryUsageBytes: z.number().describe('Current memory usage in bytes'),
	memoryLimitBytes: z.number().describe('Memory limit in bytes'),
	memoryRssBytes: z.number().describe('Resident set size in bytes'),
	memoryCacheBytes: z.number().describe('Page cache memory in bytes'),
	memorySwapBytes: z.number().describe('Swap usage in bytes'),
	oomKillCount: z.number().describe('Number of OOM kill events'),
	netRxBytesDelta: z.number().describe('Network bytes received since last report'),
	netTxBytesDelta: z.number().describe('Network bytes transmitted since last report'),
	netRxPacketsDelta: z.number().describe('Network packets received since last report'),
	netTxPacketsDelta: z.number().describe('Network packets transmitted since last report'),
	blkioReadBytesDelta: z.number().describe('Block I/O bytes read since last report'),
	blkioWriteBytesDelta: z.number().describe('Block I/O bytes written since last report'),
	pidCount: z.number().describe('Number of running processes'),
	healthy: z.boolean().describe('Whether the container health check is passing'),
	inflightRequests: z.number().describe('Number of in-flight HTTP requests'),
	startedAtUs: z.number().describe('Container start time in microseconds since epoch'),
	lastUpdatedUs: z.number().describe('Last metrics update time in microseconds since epoch'),
	ipv4Address: z.string().describe('Container IPv4 address'),
	ipv6Address: z.string().describe('Container IPv6 address'),
});

const NodeMonitorReportSchema = z.object({
	machineId: z.string().describe('Unique machine identifier'),
	reportedAtUs: z.number().describe('Report timestamp in microseconds since epoch'),
	seq: z.number().describe('Monotonically increasing sequence number'),
	host: HostMetricsSchema.describe('Host-level metrics'),
	containers: z.array(ContainerMetricsSchema).describe('Per-container metrics'),
	capacity: CapacitySummarySchema.describe('Computed capacity and pressure summary'),
	events: z.array(NodeEventSchema).describe('Node events since last report'),
	reportIntervalSeconds: z.number().describe('Interval between reports in seconds'),
});

const StreamHealthSchema = z
	.enum(['CONNECTED', 'STALE', 'DISCONNECTED'])
	.describe('Machine connection health state');

const MachineMonitorStateSchema = z.object({
	machineId: z.string().describe('Unique machine identifier'),
	orgId: z.string().describe('Organization that owns the machine'),
	report: NodeMonitorReportSchema.describe('Latest monitor report from the node'),
	compositeScore: z.number().describe('Composite pressure score (0-1, higher = more pressure)'),
	health: StreamHealthSchema.describe('Machine connection health state'),
	reportedAt: z.string().describe('ISO 8601 timestamp of the latest report'),
	updatedAt: z.string().describe('ISO 8601 timestamp of the last state update'),
	gravity: z.string().describe('Gravity server the machine is connected to'),
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const MonitorNodesListResponseSchema = APIResponseSchema(z.array(MachineMonitorStateSchema));
const MonitorNodeGetResponseSchema = APIResponseSchema(MachineMonitorStateSchema);
const MonitorNodeContainersResponseSchema = APIResponseSchema(z.array(ContainerMetricsSchema));

export const MonitorResponseError = StructuredError('MonitorResponseError')<{
	path?: string;
}>();

export const MonitorScopeError = StructuredError('MonitorScopeError')<{
	scope: string;
}>();

export const MonitorWebSocketError = StructuredError('MonitorWebSocketError')<{
	code: 'connection_failed' | 'auth_failed' | 'connection_error' | 'max_reconnects_exceeded';
}>();

export async function listMonitorNodes(client: APIClient): Promise<MachineMonitorState[]> {
	const resp = await client.get('/monitor/nodes', MonitorNodesListResponseSchema);
	if (resp.success) {
		return resp.data;
	}
	throw new MonitorResponseError({ message: resp.message || 'Failed to list monitor nodes' });
}

export async function getMonitorNode(
	client: APIClient,
	machineId: string
): Promise<MachineMonitorState> {
	const resp = await client.get(
		`/monitor/nodes/${encodeURIComponent(machineId)}`,
		MonitorNodeGetResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new MonitorResponseError({
		message: resp.message || 'Failed to get monitor node',
		path: `/monitor/nodes/${machineId}`,
	});
}

export async function listDistressedNodes(client: APIClient): Promise<MachineMonitorState[]> {
	const resp = await client.get('/monitor/nodes/distressed', MonitorNodesListResponseSchema);
	if (resp.success) {
		return resp.data;
	}
	throw new MonitorResponseError({
		message: resp.message || 'Failed to list distressed monitor nodes',
	});
}

export async function listMonitorNodeContainers(
	client: APIClient,
	machineId: string
): Promise<ContainerMetrics[]> {
	const resp = await client.get(
		`/monitor/nodes/${encodeURIComponent(machineId)}/containers`,
		MonitorNodeContainersResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new MonitorResponseError({
		message: resp.message || 'Failed to list monitor containers',
		path: `/monitor/nodes/${machineId}/containers`,
	});
}

function toWsUrl(baseUrl: string): string {
	const wsUrl = baseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
	return `${wsUrl.replace(/\/$/, '')}/monitor/ws`;
}

function toScopeMessage(scope: MonitorScope) {
	if (scope.scope === 'machine') {
		if (!scope.machineId) {
			throw new MonitorScopeError({
				message: 'machineId is required for machine scope',
				scope: 'machine',
			});
		}
		return {
			type: 'subscribe',
			scope: 'machine',
			machine_id: scope.machineId,
		};
	}
	if (scope.scope === 'deployment') {
		if (!scope.deploymentId) {
			throw new MonitorScopeError({
				message: 'deploymentId is required for deployment scope',
				scope: 'deployment',
			});
		}
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
		if (!Array.isArray(data.machines)) {
			return null;
		}
		return {
			type: 'snapshot',
			machines: data.machines as MachineMonitorState[],
		};
	}

	if (type === 'update') {
		const machineId =
			(typeof data.machineId === 'string' ? data.machineId : null) ??
			(typeof data.machine_id === 'string' ? data.machine_id : null);
		if (!machineId || !data.report || typeof data.report !== 'object') {
			return null;
		}
		return {
			type: 'update',
			machineId,
			health: toStreamHealth(data.health),
			report: data.report as MonitorUpdate['report'],
		};
	}

	if (type === 'state_change') {
		const machineId =
			(typeof data.machineId === 'string' ? data.machineId : null) ??
			(typeof data.machine_id === 'string' ? data.machine_id : null);
		if (!machineId) {
			return null;
		}
		return {
			type: 'state_change',
			machineId,
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
		if (this.#state !== 'closed') {
			return;
		}
		this.#intentionallyClosed = false;
		if (this.#reconnectTimer !== null) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = null;
		}
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
			onError?.(
				new MonitorWebSocketError({
					message: `Failed to create monitor WebSocket: ${String(error)}`,
					code: 'connection_failed',
				})
			);
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
				const data = parsed as Record<string, unknown>;
				if (data.error) {
					this.#state = 'closed';
					onError?.(
						new MonitorWebSocketError({
							message: `Monitor auth failed: ${String(data.error)}`,
							code: 'auth_failed',
						})
					);
					this.#intentionallyClosed = true;
					this.#ws?.close(4001, 'Auth failed');
					return;
				}
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
			onError?.(
				new MonitorWebSocketError({
					message: 'Monitor WebSocket connection error',
					code: 'connection_error',
				})
			);
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
				new MonitorWebSocketError({
					message: `Exceeded max monitor reconnection attempts (${maxReconnectAttempts})`,
					code: 'max_reconnects_exceeded',
				})
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
			// Only terminate for fatal errors (e.g., max reconnect attempts exceeded or auth failures).
			// Transient errors are handled by the client's auto-reconnect logic.
			if (
				'code' in error &&
				(error.code === 'max_reconnects_exceeded' || error.code === 'auth_failed')
			) {
				done = true;
			}
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
