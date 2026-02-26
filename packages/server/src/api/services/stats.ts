import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { StructuredError } from '@agentuity/core';

// --- Error ---

export const ServiceStatsError = StructuredError('ServiceStatsError')<{
	message: string;
}>();

// --- Zod Schemas ---

export const TopAgentSchema = z.object({
	agentId: z.string().describe('the agent id'),
	agentName: z.string().describe('the agent name'),
	projectName: z.string().describe('the project name'),
	requestCount: z.number().describe('number of requests by this agent'),
	percentage: z.number().describe('percentage of total requests (0-100)'),
});

export const ServiceStatSchema = z.object({
	totalRequests: z.number().describe('total number of requests'),
	successfulRequests: z.number().describe('number of successful requests'),
	failedRequests: z.number().describe('number of failed requests'),
	errorRate: z.number().describe('error rate as percentage (0-100)'),
	avgLatencyMs: z.number().describe('average latency in milliseconds'),
	p50LatencyMs: z.number().describe('50th percentile latency in milliseconds'),
	p99LatencyMs: z.number().describe('99th percentile latency in milliseconds'),
	topAgent: TopAgentSchema.nullable().describe('the top agent by request count, or null if no data'),
});

export const ServiceStatsDataSchema = z.object({
	services: z.record(z.string(), ServiceStatSchema).describe('stats per service name'),
});

export const ServiceStatsResponseSchema = APIResponseSchema(ServiceStatsDataSchema);

// --- Types ---

export type TopAgent = z.infer<typeof TopAgentSchema>;
export type ServiceStat = z.infer<typeof ServiceStatSchema>;
export type ServiceStatsData = z.infer<typeof ServiceStatsDataSchema>;
export type ServiceStatsResponse = z.infer<typeof ServiceStatsResponseSchema>;

// --- Valid Services ---

/**
 * Valid service names that can be used to filter stats.
 */
export const VALID_SERVICES = [
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
 * Returns per-service stats including total requests, latency percentiles,
 * error rates, and the top agent by usage.
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
 * console.log(`KV requests: ${stats.services.keyvalue?.totalRequests}`);
 * ```
 *
 * @example
 * ```typescript
 * // Get stats for a specific service with time range
 * const stats = await getServiceStats(client, 'org_123', {
 *   service: 'keyvalue',
 *   start: '2026-01-01T00:00:00Z',
 *   end: '2026-02-01T00:00:00Z',
 * });
 * ```
 */
export async function getServiceStats(
	client: APIClient,
	orgId: string,
	options?: ServiceStatsOptions,
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
		Object.keys(headers).length > 0 ? headers : undefined,
	);

	if (resp.success) {
		return resp.data;
	}

	throw new ServiceStatsError({
		message: resp.message || 'Failed to get service stats',
	});
}
