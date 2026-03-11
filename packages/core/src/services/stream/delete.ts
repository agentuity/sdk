import { z } from 'zod';
import { type APIClient } from '../api.ts';
import { StreamResponseError } from './util.ts';

// --- Response schemas matching Pulse format ---

const DeleteStreamResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().optional(),
	}),
	z.object({
		success: z.literal<true>(true),
	}),
]);

type DeleteStreamResponse = z.infer<typeof DeleteStreamResponseSchema>;

const DeleteNamespaceResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().optional(),
	}),
	z.object({
		success: z.literal<true>(true),
		deleted: z.number(),
	}),
]);

type DeleteNamespaceResponse = z.infer<typeof DeleteNamespaceResponseSchema>;

// --- Return types ---

export interface StreamDeleteNamespaceResult {
	deleted: number;
}

// --- Functions ---

/**
 * Delete a single stream by ID.
 *
 * @param client - The API client configured for Pulse
 * @param id - The stream ID to delete
 *
 * @example
 * await streamDelete(client, 'strm_abc123');
 */
export async function streamDelete(client: APIClient, id: string): Promise<void> {
	const resp = await client.delete<DeleteStreamResponse>(
		`/${encodeURIComponent(id)}`,
		DeleteStreamResponseSchema
	);

	if (resp.success) {
		return;
	}

	throw new StreamResponseError({ message: resp.message });
}

/**
 * Delete all streams in a namespace (soft delete).
 *
 * @param client - The API client configured for Pulse
 * @param name - The namespace name to delete
 * @returns The number of streams that were deleted
 *
 * @example
 * const result = await streamDeleteNamespace(client, 'old-logs');
 * console.log(`Deleted ${result.deleted} streams`);
 */
export async function streamDeleteNamespace(
	client: APIClient,
	name: string
): Promise<StreamDeleteNamespaceResult> {
	const resp = await client.delete<DeleteNamespaceResponse>(
		`/namespace/${encodeURIComponent(name)}`,
		DeleteNamespaceResponseSchema
	);

	if (resp.success) {
		return { deleted: resp.deleted };
	}

	throw new StreamResponseError({ message: resp.message });
}
