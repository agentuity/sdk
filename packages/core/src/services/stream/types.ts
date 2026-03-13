import { z } from 'zod';

// ---------------------------------------------------------------------------
// API-level Zod schemas for the Durable Streams HTTP API.
//
// These use snake_case field names matching the raw HTTP contract.
// The SDK-layer schemas in service.ts use camelCase (JS convention).
// ---------------------------------------------------------------------------

/** Request body for POST /stream (create stream) */
export const CreateStreamApiRequestSchema = z.object({
	name: z.string().describe('The namespace/group name (1–254 chars)'),
	metadata: z.record(z.string(), z.string()).optional().describe('Optional key-value metadata'),
	headers: z
		.record(z.string(), z.string())
		.optional()
		.describe('Optional headers map (commonly includes `content-type`)'),
	ttl: z.number().nullable().optional().describe('Stream TTL in seconds'),
});

export type CreateStreamApiRequest = z.infer<typeof CreateStreamApiRequestSchema>;

/** Request body for POST /stream/list (list streams) */
export const ListStreamsApiRequestSchema = z.object({
	name: z.string().optional().describe('Filter by namespace'),
	metadata: z.record(z.string(), z.string()).optional().describe('Filter by metadata fields'),
	limit: z.number().optional().describe('Maximum streams to return'),
	offset: z.number().optional().describe('Offset for pagination'),
	sort: z
		.string()
		.optional()
		.describe('Sort by `name`, `created`, `updated`, `size`, `count`, or `lastUsed`'),
	direction: z.string().optional().describe('Sort direction: `asc` or `desc`'),
});

export type ListStreamsApiRequest = z.infer<typeof ListStreamsApiRequestSchema>;

/** Single stream info object (snake_case, matches API response) */
export const StreamInfoApiSchema = z.object({
	id: z.string().describe('Stream ID'),
	name: z.string().describe('Namespace name'),
	metadata: z.record(z.string(), z.string()).describe('Stream metadata'),
	url: z.string().describe('Public stream URL'),
	size_bytes: z.number().describe('Current stream size in bytes'),
	expires_at: z.string().nullable().describe('ISO 8601 expiration timestamp'),
});

export type StreamInfoApi = z.infer<typeof StreamInfoApiSchema>;

/**
 * Response for POST /stream/list.
 *
 * Not currently used by the API reference generator because the nested
 * `streams[].*` fields use shorter descriptions in the docs than the verbose
 * forms defined in {@link StreamInfoApiSchema}. Exported as a type reference
 * for consumers that need the full response shape.
 */
export const ListStreamsApiResponseSchema = z.object({
	success: z.boolean().describe('Whether the request succeeded'),
	streams: z.array(StreamInfoApiSchema).describe('Matching streams'),
	total: z.number().describe('Total matches'),
});

export type ListStreamsApiResponse = z.infer<typeof ListStreamsApiResponseSchema>;
