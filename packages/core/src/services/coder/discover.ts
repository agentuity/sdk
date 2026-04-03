import { z } from 'zod/v4';
import { type APIClient } from '../api.ts';
import { normalizeCoderUrl } from './util.ts';

export const DiscoverCoderUrlDataSchema = z
	.object({
		url: z.string().describe('Discovered base URL for the organization Coder URL'),
	})
	.describe('Response payload for coder URL discovery');

/**
 * Discovers the org-specific Coder URL.
 *
 * Calls `GET /coder` on the Catalyst API. The org is resolved server-side
 * from the API key's auth context (not via query parameters).
 */
export async function discoverUrl(client: APIClient): Promise<string> {
	const resp = await client.get<z.infer<typeof DiscoverCoderUrlDataSchema>>(
		'/coder',
		DiscoverCoderUrlDataSchema
	);
	return normalizeCoderUrl(resp.url);
}