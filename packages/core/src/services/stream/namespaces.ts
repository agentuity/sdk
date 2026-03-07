import { z } from 'zod';
import { type APIClient } from '../api.ts';
import { StreamResponseError } from './util.ts';

// --- Schemas ---

export const NamespaceInfoSchema = z.object({
	name: z.string().describe('the namespace name'),
	count: z.number().describe('number of streams in this namespace'),
	total_size: z.number().describe('total size in bytes across all streams'),
	created_at: z.string().describe('ISO 8601 timestamp of the earliest stream'),
	last_used_at: z.string().describe('ISO 8601 timestamp of the most recent activity'),
	internal: z.boolean().describe('whether this namespace contains internal/system streams'),
});

export type NamespaceInfo = z.infer<typeof NamespaceInfoSchema>;

// Response schema matching Pulse's format (NO data wrapper)
const ListNamespacesResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().optional(),
	}),
	z.object({
		success: z.literal<true>(true),
		namespaces: z.array(NamespaceInfoSchema),
		total: z.number(),
	}),
]);

type ListNamespacesResponse = z.infer<typeof ListNamespacesResponseSchema>;

export const StreamNamespaceEntrySchema = z.object({
	id: z.string().describe('the stream entry id'),
	name: z.string().describe('the stream namespace name'),
	created_at: z.string().nullable().describe('ISO 8601 creation timestamp'),
	updated_at: z.string().nullable().describe('ISO 8601 last update timestamp'),
	org_id: z.string().describe('the organization id'),
	project_id: z.string().nullable().describe('the project id'),
	chunks: z.number().describe('number of chunks'),
	completed: z.boolean().describe('whether the stream upload is completed'),
	size_bytes: z.number().describe('size in bytes'),
	started_at: z.string().nullable().describe('ISO 8601 stream start timestamp'),
	ended_at: z.string().nullable().describe('ISO 8601 stream end timestamp'),
	headers: z.record(z.string(), z.string()).nullable().optional().describe('stream headers'),
	metadata: z.record(z.string(), z.string()).nullable().optional().describe('stream metadata'),
	expires_at: z.string().nullable().describe('ISO 8601 expiration timestamp or null'),
	url: z.string().describe('public URL to access the stream'),
});

export type StreamNamespaceEntry = z.infer<typeof StreamNamespaceEntrySchema>;

const GetNamespaceResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().optional(),
	}),
	z.object({
		success: z.literal<true>(true),
		name: z.string(),
		entries: z.array(StreamNamespaceEntrySchema),
		total: z.number(),
		total_size: z.number(),
	}),
]);

type GetNamespaceResponse = z.infer<typeof GetNamespaceResponseSchema>;

// --- Options ---

export interface StreamListNamespacesOptions {
	limit?: number;
	offset?: number;
}

export interface StreamGetNamespaceOptions {
	limit?: number;
	offset?: number;
}

// --- Return types ---

export interface StreamNamespacesResult {
	namespaces: NamespaceInfo[];
	total: number;
}

export interface StreamNamespaceResult {
	name: string;
	entries: StreamNamespaceEntry[];
	total: number;
	totalSize: number;
}

// --- Functions ---

/**
 * List stream namespaces (aggregated view).
 * Each namespace groups streams by name, showing count, total size, and timestamps.
 *
 * @param client - The API client configured for Pulse
 * @param options - Pagination options
 * @returns Aggregated namespace list with total count
 *
 * @example
 * const result = await streamListNamespaces(client, { limit: 50 });
 * console.log(`Found ${result.total} namespaces`);
 */
export async function streamListNamespaces(
	client: APIClient,
	options: StreamListNamespacesOptions = {}
): Promise<StreamNamespacesResult> {
	const resp = await client.post<ListNamespacesResponse>(
		'/namespaces',
		{ limit: options.limit, offset: options.offset },
		ListNamespacesResponseSchema
	);

	if (resp.success) {
		return { namespaces: resp.namespaces, total: resp.total };
	}

	throw new StreamResponseError({ message: resp.message });
}

/**
 * Get entries within a specific stream namespace.
 * Returns full detail for each stream entry in the namespace.
 *
 * @param client - The API client configured for Pulse
 * @param name - The namespace name
 * @param options - Pagination options
 * @returns Namespace entries with total count and size
 *
 * @example
 * const result = await streamGetNamespace(client, 'agent-logs', { limit: 100 });
 * console.log(`${result.total} entries, ${result.totalSize} bytes total`);
 */
export async function streamGetNamespace(
	client: APIClient,
	name: string,
	options: StreamGetNamespaceOptions = {}
): Promise<StreamNamespaceResult> {
	const resp = await client.post<GetNamespaceResponse>(
		`/namespace/${encodeURIComponent(name)}/info`,
		{ limit: options.limit, offset: options.offset },
		GetNamespaceResponseSchema
	);

	if (resp.success) {
		return {
			name: resp.name,
			entries: resp.entries,
			total: resp.total,
			totalSize: resp.total_size,
		};
	}

	throw new StreamResponseError({ message: resp.message });
}
