import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { StructuredError } from '@agentuity/core';

// --- Error ---

export const ServiceStatsError = StructuredError('ServiceStatsError')<{
	message: string;
}>();

// --- Per-Service Stat Schemas ---

export const KeyValueStatSchema = z.object({
	namespaceCount: z.number(),
	keyCount: z.number(),
	totalSizeBytes: z.number(),
});

export const VectorStatSchema = z.object({
	namespaceCount: z.number(),
	documentCount: z.number(),
	totalSizeBytes: z.number(),
});

export const QueueStatSchema = z.object({
	queueCount: z.number(),
	totalMessages: z.number(),
	totalDlq: z.number(),
});

export const StreamStatSchema = z.object({
	streamCount: z.number(),
	totalSizeBytes: z.number(),
});

export const SandboxStatSchema = z.object({
	totalActive: z.number(),
	running: z.number(),
	idle: z.number(),
	creating: z.number(),
	totalExecutions: z.number(),
	totalCpuTimeMs: z.number(),
	totalMemoryByteSec: z.number(),
	totalNetworkEgressBytes: z.number(),
});

export const EmailStatSchema = z.object({
	addressCount: z.number(),
	inboundCount: z.number(),
	outboundCount: z.number(),
	outboundSuccess: z.number(),
	outboundFailed: z.number(),
});

export const TaskStatSchema = z.object({
	total: z.number().default(0),
	open: z.number().default(0),
	inProgress: z.number().default(0),
	done: z.number().default(0),
	closed: z.number().default(0),
	cancelled: z.number().default(0),
});

export const ScheduleStatSchema = z.object({
	scheduleCount: z.number(),
	totalDeliveries: z.number(),
	successDeliveries: z.number(),
	failedDeliveries: z.number(),
});

export const DatabaseStatSchema = z.object({
	databaseCount: z.number(),
	totalTableCount: z.number(),
	totalRecordCount: z.number(),
	totalSizeBytes: z.number(),
});

// --- Aggregate Schema ---

export const ServiceStatsDataSchema = z.object({
	services: z.object({
		database: DatabaseStatSchema.optional(),
		keyvalue: KeyValueStatSchema.optional(),
		vector: VectorStatSchema.optional(),
		queue: QueueStatSchema.optional(),
		stream: StreamStatSchema.optional(),
		sandbox: SandboxStatSchema.optional(),
		email: EmailStatSchema.optional(),
		task: TaskStatSchema.optional(),
		schedule: ScheduleStatSchema.optional(),
	}),
});

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

export interface ServiceStatsOptions {
	/**
	 * Filter to a specific service. If omitted, returns stats for all services.
	 */
	service?: ServiceName;
	/**
	 * Start time filter (ISO 8601 timestamp).
	 */
	start?: string;
	/**
	 * End time filter (ISO 8601 timestamp).
	 */
	end?: string;
	/**
	 * For CLI auth: sets x-agentuity-orgid header.
	 * Required when using CLI token auth (bearer tokens without embedded org).
	 */
	orgIdHeader?: string;
}

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
	const url = `/services/stats/2026-02-26/${encodeURIComponent(orgId)}${queryString ? `?${queryString}` : ''}`;

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
