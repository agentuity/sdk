import { z } from 'zod';

/** API-level request for creating a namespace (uses snake_case field names) */
export const CreateNamespaceApiRequestSchema = z.object({
	default_ttl_seconds: z
		.number()
		.optional()
		.describe(
			'Default TTL for keys in this namespace (in seconds). If omitted, defaults to 7 days (604,800). Use 0 for keys that never expire.'
		),
});

/** Metadata for a key-value item in search results */
export const KeyValueItemMetadataSchema = z.object({
	value: z.unknown().describe('The stored value (base64-encoded for binary)'),
	contentType: z.string().describe('MIME type of the stored value'),
	size: z.number().describe('Size in bytes'),
	expiresAt: z.string().nullable().describe('ISO 8601 expiration timestamp'),
	firstUsed: z.number().nullable().describe('Unix timestamp (ms) of first access'),
	lastUsed: z.number().nullable().describe('Unix timestamp (ms) of last access'),
	count: z.number().nullable().describe('Number of times accessed'),
});

export type CreateNamespaceApiRequest = z.infer<typeof CreateNamespaceApiRequestSchema>;
export type KeyValueItemMetadata = z.infer<typeof KeyValueItemMetadataSchema>;
