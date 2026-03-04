import { z } from 'zod';
import { type APIClient, APIResponseSchema } from './api.ts';
import { StructuredError } from '../error.ts';

// --- Error ---

export const ServiceStatsError = StructuredError('ServiceStatsError')<{
	message: string;
}>();

// --- Per-Service Stat Schemas ---

export const KeyValueStatSchema = z.object({
	namespaceCount: z.number().describe('Total number of key-value namespaces.'),
	keyCount: z.number().describe('Total number of keys across all namespaces.'),
	totalSizeBytes: z.number().describe('Total storage size in bytes across all namespaces.'),
}).describe('Key-value service statistics.');

export const VectorStatSchema = z.object({
	namespaceCount: z.number().describe('Total number of vector namespaces.'),
	documentCount: z.number().describe('Total number of documents across all namespaces.'),
	totalSizeBytes: z.number().describe('Total storage size in bytes across all namespaces.'),
}).describe('Vector service statistics.');

export const QueueStatSchema = z.object({
	queueCount: z.number().describe('Total number of queues.'),
	totalMessages: z.number().describe('Total number of messages across all queues.'),
	totalDlq: z.number().describe('Total number of dead letter queue messages across all queues.'),
}).describe('Queue service statistics.');

export const StreamStatSchema = z.object({
	streamCount: z.number().describe('Total number of streams.'),
	totalSizeBytes: z.number().describe('Total storage size in bytes across all streams.'),
}).describe('Stream service statistics.');

export const SandboxStatSchema = z.object({
	totalActive: z.number().describe('Total number of active sandboxes.'),
	running: z.number().describe('Number of sandboxes currently running.'),
	idle: z.number().describe('Number of sandboxes currently idle.'),
	creating: z.number().describe('Number of sandboxes being created.'),
	totalExecutions: z.number().describe('Total number of sandbox executions.'),
	totalCpuTimeMs: z.number().describe('Total CPU time consumed in milliseconds.'),
	totalMemoryByteSec: z.number().describe('Total memory usage in byte-seconds.'),
	totalNetworkEgressBytes: z.number().describe('Total network egress in bytes.'),
}).describe('Sandbox service statistics.');

export const EmailStatSchema = z.object({
	addressCount: z.number().describe('Total number of email addresses.'),
	inboundCount: z.number().describe('Total number of inbound emails received.'),
	outboundCount: z.number().describe('Total number of outbound emails sent.'),
	outboundSuccess: z.number().describe('Number of outbound emails delivered successfully.'),
	outboundFailed: z.number().describe('Number of outbound emails that failed delivery.'),
}).describe('Email service statistics.');

export const TaskStatSchema = z.object({
	total: z.number().default(0).describe('Total number of tasks.'),
	open: z.number().default(0).describe('Number of open tasks.'),
	inProgress: z.number().default(0).describe('Number of tasks currently in progress.'),
	done: z.number().default(0).describe('Number of completed tasks.'),
	closed: z.number().default(0).describe('Number of closed tasks.'),
	cancelled: z.number().default(0).describe('Number of cancelled tasks.'),
}).describe('Task service statistics.');

export const ScheduleStatSchema = z.object({
	scheduleCount: z.number().describe('Total number of schedules.'),
	totalDeliveries: z.number().describe('Total number of scheduled deliveries.'),
	successDeliveries: z.number().describe('Number of successful scheduled deliveries.'),
	failedDeliveries: z.number().describe('Number of failed scheduled deliveries.'),
}).describe('Schedule service statistics.');

export const DatabaseStatSchema = z.object({
	databaseCount: z.number().describe('Total number of databases.'),
	totalTableCount: z.number().describe('Total number of tables across all databases.'),
	totalRecordCount: z.number().describe('Total number of records across all tables.'),
	totalSizeBytes: z.number().describe('Total storage size in bytes across all databases.'),
}).describe('Database service statistics.');

// --- Aggregate Schema ---

export const ServiceStatsDataSchema = z.object({
	services: z.object({
		database: DatabaseStatSchema.optional().describe('Database service statistics.'),
		keyvalue: KeyValueStatSchema.optional().describe('Key-value service statistics.'),
		vector: VectorStatSchema.optional().describe('Vector service statistics.'),
		queue: QueueStatSchema.optional().describe('Queue service statistics.'),
		stream: StreamStatSchema.optional().describe('Stream service statistics.'),
		sandbox: SandboxStatSchema.optional().describe('Sandbox service statistics.'),
		email: EmailStatSchema.optional().describe('Email service statistics.'),
		task: TaskStatSchema.optional().describe('Task service statistics.'),
		schedule: ScheduleStatSchema.optional().describe('Schedule service statistics.'),
	}).describe('Per-service statistics breakdown.'),
}).describe('Aggregated service statistics data.');

export const ServiceStatsResponseSchema = APIResponseSchema(ServiceStatsDataSchema);

// --- Types ---

export type KeyValueStat = z.infer<typeof KeyValueStatSchema>;
export type VectorStat = z.infer<typeof VectorStatSchema>;
export type QueueStat = z.infer<typeof QueueStatSchema>;
export type StreamStat = z.infer<typeof StreamStatSchema>;
export type SandboxStat = z.infer<typeof SandboxStatSchema>;
export type EmailStat = z.infer<typeof EmailStatSchema>;
export type TaskStat = z.infer<typeof TaskStatSchema>;
export type ScheduleStat = z.infer<typeof ScheduleStatSchema>;
export type DatabaseStat = z.infer<typeof DatabaseStatSchema>;
export type ServiceStatsData = z.infer<typeof ServiceStatsDataSchema>;
export type ServiceStatsResponse = z.infer<typeof ServiceStatsResponseSchema>;

// --- Valid Services ---

/**
 * Valid service names that can be used to filter stats.
 */
export const VALID_SERVICES = [
	'database',
	'keyvalue',
	'email',
	'vector',
	'schedule',
	'task',
	'stream',
	'sandbox',
	'queue',
] as const;

export type ServiceName = (typeof VALID_SERVICES)[number];

// --- Options ---

export const ServiceStatsOptionsSchema = z.object({
	service: z
		.enum(VALID_SERVICES)
		.optional()
		.describe('Optional service filter; when omitted returns all services'),
	start: z.string().optional().describe('Optional start timestamp (ISO 8601)'),
	end: z.string().optional().describe('Optional end timestamp (ISO 8601)'),
	orgIdHeader: z
		.string()
		.optional()
		.describe('Optional org id header for CLI token authentication'),
});

export type ServiceStatsOptions = z.infer<typeof ServiceStatsOptionsSchema>;

// --- API Function ---

/**
 * Get aggregated stats for services used by an organization.
 *
 * Returns per-service stats with service-specific fields (counts, sizes, etc.).
 * Services that error on the backend are omitted from the response.
 * Services with no provisioned tenant DB return zero values.
 *
 * @param client - The API client instance
 * @param orgId - The organization ID
 * @param options - Optional filtering (service, time range)
 * @returns Service stats data with per-service breakdown
 * @throws {ServiceStatsError} If the API request fails
 *
 * @example
 * ```typescript
 * // Get stats for all services
 * const stats = await getServiceStats(client, 'org_123');
 * console.log(`KV keys: ${stats.services.keyvalue?.keyCount}`);
 * ```
 *
 * @example
 * ```typescript
 * // Get stats for a specific service
 * const stats = await getServiceStats(client, 'org_123', {
 *   service: 'keyvalue',
 * });
 * ```
 */
export async function getServiceStats(
	client: APIClient,
	orgId: string,
	options?: ServiceStatsOptions
): Promise<ServiceStatsData> {
	const params = new URLSearchParams();
	if (options?.service) params.set('service', options.service);
	if (options?.start) params.set('start', options.start);
	if (options?.end) params.set('end', options.end);

	const queryString = params.toString();
	const url = `/services/stats/${encodeURIComponent(orgId)}${queryString ? `?${queryString}` : ''}`;

	const headers: Record<string, string> = {};
	if (options?.orgIdHeader) {
		headers['x-agentuity-orgid'] = options.orgIdHeader;
	}

	const resp = await client.get(
		url,
		ServiceStatsResponseSchema,
		undefined,
		Object.keys(headers).length > 0 ? headers : undefined
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ServiceStatsError({
		message: resp.message || 'Failed to get service stats',
	});
}
