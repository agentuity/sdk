import { z } from 'zod';

/** Valid storage tier values */
export const StorageTierValues = ['STANDARD', 'INFREQUENT_ACCESS', 'ARCHIVE'] as const;

/** Storage tier enum schema */
export const StorageTierSchema = z.enum(StorageTierValues).describe('Storage tier for the bucket');

/** Storage tier type */
export type StorageTier = z.infer<typeof StorageTierSchema>;

/** CORS configuration for a bucket */
export const CORSConfigSchema = z.object({
	allowed_origins: z.array(z.string().describe('An allowed origin URL')).optional().describe('List of allowed origin URLs for CORS requests'),
	allowed_methods: z.array(z.string().describe('An allowed HTTP method')).optional().describe('List of allowed HTTP methods for CORS requests'),
	allowed_headers: z.array(z.string().describe('An allowed request header')).optional().describe('List of allowed request headers for CORS requests'),
	expose_headers: z.array(z.string().describe('A response header to expose')).optional().describe('List of response headers to expose to the browser'),
	max_age_seconds: z.number().int().nullable().optional().describe('Maximum time in seconds that preflight results can be cached'),
});

/** Full bucket config (response from GET/PUT) */
export const BucketConfigSchema = z.object({
	bucket_name: z.string().describe('The name of the storage bucket'),
	storage_tier: StorageTierSchema.nullable().optional().describe('Storage tier for the bucket'),
	ttl: z.number().int().nullable().optional().describe('Object TTL in seconds'),
	public: z.boolean().nullable().optional().describe('Whether the bucket is publicly accessible'),
	cache_control: z.string().nullable().optional().describe('Default Cache-Control header for objects'),
	cors: CORSConfigSchema.nullable().optional().describe('Custom CORS configuration'),
	additional_headers: z.record(z.string(), z.string()).nullable().optional().describe('Additional response headers as key-value pairs'),
	bucket_location: z.string().nullable().optional().describe('Bucket location or region override'),
});

/**
 * Update request body (all fields optional — partial update).
 * Send a field with a value to set it, send null to unset it, omit to leave unchanged.
 */
export const BucketConfigUpdateSchema = z.object({
	storage_tier: StorageTierSchema.nullable().optional().describe('Storage tier for the bucket'),
	ttl: z.number().int().min(0).nullable().optional().describe('Object TTL in seconds (0 to clear)'),
	public: z.boolean().nullable().optional().describe('Whether the bucket is publicly accessible'),
	cache_control: z.string().nullable().optional().describe('Default Cache-Control header for objects'),
	cors: CORSConfigSchema.nullable().optional().describe('Custom CORS configuration'),
	additional_headers: z.record(z.string(), z.string()).nullable().optional().describe('Additional response headers as key-value pairs'),
	bucket_location: z.string().nullable().optional().describe('Bucket location or region override'),
});

/** TypeScript types derived from Zod schemas */
export type CORSConfig = z.infer<typeof CORSConfigSchema>;
export type BucketConfig = z.infer<typeof BucketConfigSchema>;
export type BucketConfigUpdate = z.infer<typeof BucketConfigUpdateSchema>;
