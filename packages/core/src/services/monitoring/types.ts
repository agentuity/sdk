export interface NodeMonitorReport {
	machineId: string;
	reportedAtUs: number;
	seq: number;
	host: HostMetrics;
	containers: ContainerMetrics[];
	capacity: CapacitySummary;
	events: NodeEvent[];
	reportIntervalSeconds: number;
}

export interface HostMetrics {
	cpu: CpuMetrics;
	memory: MemoryMetrics;
	disks: DiskMetrics[];
	networkInterfaces: NetworkInterfaceMetrics[];
	system: SystemInfo;
}

export interface CpuMetrics {
	usagePercent: number;
	coreUsagePercent: number[];
	loadAvg1: number;
	loadAvg5: number;
	loadAvg15: number;
	coreCount: number;
}

export interface MemoryMetrics {
	totalBytes: number;
	usedBytes: number;
	availableBytes: number;
	cachedBytes: number;
	buffersBytes: number;
	swapTotalBytes: number;
	swapUsedBytes: number;
	usagePercent: number;
}

export interface DiskMetrics {
	mountPoint: string;
	device: string;
	fsType: string;
	totalBytes: number;
	usedBytes: number;
	availableBytes: number;
	usagePercent: number;
	inodesTotal: number;
	inodesUsed: number;
	readBytesDelta: number;
	writeBytesDelta: number;
	readOpsDelta: number;
	writeOpsDelta: number;
}

export interface NetworkInterfaceMetrics {
	name: string;
	rxBytesDelta: number;
	txBytesDelta: number;
	rxPacketsDelta: number;
	txPacketsDelta: number;
	rxErrorsDelta: number;
	txErrorsDelta: number;
	rxDropsDelta: number;
	txDropsDelta: number;
	linkState: string;
	speedMbps: number;
}

export interface SystemInfo {
	hostname: string;
	kernelVersion: string;
	os: string;
	arch: string;
	uptimeSeconds: number;
	cpuCount: number;
	totalMemoryBytes: number;
}

export interface ContainerMetrics {
	deploymentId: string;
	containerId: string;
	image: string;
	state: string;
	cpuUsagePercent: number;
	cpuThrottledPeriods: number;
	cpuTotalPeriods: number;
	cpuLimitMillicores: number;
	memoryUsageBytes: number;
	memoryLimitBytes: number;
	memoryRssBytes: number;
	memoryCacheBytes: number;
	memorySwapBytes: number;
	oomKillCount: number;
	netRxBytesDelta: number;
	netTxBytesDelta: number;
	netRxPacketsDelta: number;
	netTxPacketsDelta: number;
	blkioReadBytesDelta: number;
	blkioWriteBytesDelta: number;
	pidCount: number;
	healthy: boolean;
	inflightRequests: number;
	startedAtUs: number;
	lastUpdatedUs: number;
	ipv4Address: string;
	ipv6Address: string;
}

export interface CapacitySummary {
	cpuPressure: number;
	memoryPressure: number;
	diskPressure: number;
	networkPressure: number;
	compositeScore: number;
	totalContainers: number;
	runningContainers: number;
}

export type NodeEventLevel = 'UNSPECIFIED' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export type NodeEventType =
	| 'UNSPECIFIED'
	| 'CONTAINER_START'
	| 'CONTAINER_STOP'
	| 'CONTAINER_OOM'
	| 'CONTAINER_HEALTH_CHANGE'
	| 'PRESSURE_THRESHOLD'
	| 'DISK_NEARLY_FULL'
	| 'COLLECTOR_ERROR'
	| 'PRESSURE_ALERT'
	| 'HEALTH_ALERT';

export interface NodeEvent {
	timestampUs: number;
	level: NodeEventLevel;
	type: NodeEventType;
	message: string;
	metadata: Record<string, string>;
}

export type StreamHealth = 'CONNECTED' | 'STALE' | 'DISCONNECTED';

export interface MachineMonitorState {
	machineId: string;
	orgId: string;
	report: NodeMonitorReport;
	compositeScore: number;
	health: StreamHealth;
	reportedAt: string;
	updatedAt: string;
	gravity: string;
}

export interface MonitorSnapshot {
	type: 'snapshot';
	machines: MachineMonitorState[];
}

export interface MonitorUpdate {
	type: 'update';
	machineId: string;
	health: StreamHealth;
	report: NodeMonitorReport;
}

export interface MonitorStateChange {
	type: 'state_change';
	machineId: string;
	health: StreamHealth;
	previousHealth: StreamHealth;
}

export type MonitorMessage = MonitorSnapshot | MonitorUpdate | MonitorStateChange;

export interface MonitorScope {
	scope: 'org' | 'machine' | 'deployment';
	machineId?: string;
	deploymentId?: string;
}

export type MonitorWebSocketState =
	| 'connecting'
	| 'authenticating'
	| 'subscribing'
	| 'connected'
	| 'reconnecting'
	| 'closed';

export interface MonitorWebSocketCallbacks {
	onOpen?: () => void;
	onClose?: (code: number, reason: string) => void;
	onError?: (error: Error) => void;
	onMessage?: (message: MonitorMessage) => void;
	onSnapshot?: (snapshot: MonitorSnapshot) => void;
	onUpdate?: (update: MonitorUpdate) => void;
	onStateChange?: (stateChange: MonitorStateChange) => void;
}

export interface MonitorWebSocketOptions extends MonitorWebSocketCallbacks {
	baseUrl: string;
	token: string;
	scope?: MonitorScope;
	orgId?: string;
	autoReconnect?: boolean;
	maxReconnectAttempts?: number;
	reconnectDelayMs?: number;
	maxReconnectDelayMs?: number;
}
