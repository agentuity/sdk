import { z } from 'zod';

// ---------------------------------------------------------------------------
// API-level Zod schemas for the Regions HTTP API.
// ---------------------------------------------------------------------------

/** Single region info (matches API response shape) */
export const RegionInfoApiSchema = z.object({
	region: z.string().describe('Region identifier'),
	description: z.string().describe('Human-readable region name'),
});

export type RegionInfoApi = z.infer<typeof RegionInfoApiSchema>;

/** Request body for POST /resource/{orgId}/{region} (create resources) */
export const CreateResourcesApiRequestSchema = z.object({
	resources: z.array(z.any()).describe("Array of { type: 'db'|'s3', name?, description? }"),
});

export type CreateResourcesApiRequest = z.infer<typeof CreateResourcesApiRequestSchema>;

/** Request body for DELETE /resource/{orgId}/{region} (delete resources) */
export const DeleteResourcesApiRequestSchema = z.object({
	resources: z.array(z.any()).describe("Array of { type: 'db'|'s3', name }"),
});

export type DeleteResourcesApiRequest = z.infer<typeof DeleteResourcesApiRequestSchema>;
