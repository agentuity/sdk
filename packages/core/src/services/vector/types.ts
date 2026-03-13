import { z } from 'zod';

// ============================================================================
// API Response Schemas for Vector Service
// ============================================================================

/**
 * Response schema for the upsert-vectors endpoint.
 */
export const VectorUpsertResponseSchema = z.object({
	/** Whether the request succeeded */
	success: z.boolean().describe('Whether the request succeeded'),
	/** Array of upserted vector results */
	data: z
		.array(
			z.object({
				/** Stored vector ID */
				id: z.string().describe('Stored vector ID'),
			})
		)
		.describe('Array of upserted vector results'),
});

export type VectorUpsertResponse = z.infer<typeof VectorUpsertResponseSchema>;

/**
 * Response schema for the get-vector endpoint.
 */
export const VectorGetResponseSchema = z.object({
	/** Whether the request succeeded */
	success: z.boolean().describe('Whether the request succeeded'),
	/** The vector data object */
	data: z
		.object({
			/** Internal vector ID */
			id: z.string().describe('Internal vector ID'),
			/** Vector key */
			key: z.string().describe('Vector key'),
			/** Original source document text */
			document: z.string().optional().describe('Original source document text'),
			/** Stored embeddings array */
			embeddings: z.array(z.number()).optional().describe('Stored embeddings array'),
			/** Stored metadata */
			metadata: z.record(z.string(), z.unknown()).optional().describe('Stored metadata'),
			/** Similarity score when relevant */
			similarity: z.number().describe('Similarity score when relevant'),
			/** ISO 8601 expiration timestamp */
			expiresAt: z.string().nullable().optional().describe('ISO 8601 expiration timestamp'),
		})
		.describe('The vector data object'),
});

export type VectorGetResponse = z.infer<typeof VectorGetResponseSchema>;

/**
 * Response schema for the search-vectors endpoint.
 */
export const VectorSearchResponseSchema = z.object({
	/** Whether the request succeeded */
	success: z.boolean().describe('Whether the request succeeded'),
	/** Array of matching vector results */
	data: z
		.array(
			z.object({
				/** Vector ID */
				id: z.string().describe('Vector ID'),
				/** Vector key */
				key: z.string().describe('Vector key'),
				/** Vector metadata */
				metadata: z.record(z.string(), z.unknown()).optional().describe('Vector metadata'),
				/** Similarity score (0–1) */
				similarity: z.number().describe('Similarity score (0–1)'),
				/** ISO 8601 expiration timestamp */
				expiresAt: z.string().nullable().optional().describe('ISO 8601 expiration timestamp'),
			})
		)
		.describe('Array of matching vector results'),
});

export type VectorSearchResponse = z.infer<typeof VectorSearchResponseSchema>;

/**
 * Response schema for the delete-vector and delete-multiple-vectors endpoints.
 */
export const VectorDeleteResponseSchema = z.object({
	/** Whether the request succeeded */
	success: z.boolean().describe('Whether the request succeeded'),
	/** Number of deleted vectors */
	data: z.number().describe('Number of deleted vectors'),
});

export type VectorDeleteResponse = z.infer<typeof VectorDeleteResponseSchema>;

/**
 * Request body schema for the delete-multiple-vectors endpoint.
 */
export const VectorDeleteMultipleRequestSchema = z.object({
	/** Vector keys to delete */
	keys: z.array(z.string()).optional().describe('Vector keys to delete'),
});

export type VectorDeleteMultipleRequest = z.infer<typeof VectorDeleteMultipleRequestSchema>;
