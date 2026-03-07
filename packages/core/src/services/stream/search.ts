import { z } from 'zod';
import { type APIClient } from '../api.ts';
import { StreamNamespaceEntrySchema, type StreamNamespaceEntry } from './namespaces.ts';
import { StreamResponseError } from './util.ts';

// --- Response schema matching Pulse format ---

const SearchStreamsResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().optional(),
	}),
	z.object({
		success: z.literal<true>(true),
		entries: z.array(StreamNamespaceEntrySchema),
		total: z.number(),
	}),
]);

type SearchStreamsResponse = z.infer<typeof SearchStreamsResponseSchema>;

// --- Options ---

export interface StreamSearchOptions {
	keyword: string;
	namespace?: string;
	limit?: number;
	offset?: number;
}

// --- Return types ---

export interface StreamSearchResult {
	entries: StreamNamespaceEntry[];
	total: number;
}

// --- Function ---

/**
 * Search streams by keyword across name, metadata, and headers.
 * Optionally filter by a specific namespace.
 *
 * @param client - The API client configured for Pulse
 * @param options - Search keyword, optional namespace filter, and pagination
 * @returns Matching stream entries with total count
 *
 * @example
 * const result = await streamSearch(client, { keyword: 'agent-logs' });
 * console.log(`Found ${result.total} matching streams`);
 *
 * @example
 * // Search within a specific namespace
 * const result = await streamSearch(client, {
 *   keyword: 'error',
 *   namespace: 'agent-logs',
 *   limit: 50,
 * });
 */
export async function streamSearch(
	client: APIClient,
	options: StreamSearchOptions
): Promise<StreamSearchResult> {
	const resp = await client.post<SearchStreamsResponse>(
		'/search',
		{
			keyword: options.keyword,
			namespace: options.namespace,
			limit: options.limit,
			offset: options.offset,
		},
		SearchStreamsResponseSchema
	);

	if (resp.success) {
		return { entries: resp.entries, total: resp.total };
	}

	throw new StreamResponseError({ message: resp.message });
}
