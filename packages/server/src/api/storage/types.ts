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
});

/** TypeScript types derived from Zod schemas */
export type CORSConfig = z.infer<typeof CORSConfigSchema>;
export type BucketConfig = z.infer<typeof BucketConfigSchema>;
export type BucketConfigUpdate = z.infer<typeof BucketConfigUpdateSchema>;

// --- Storage Objects types ---

/** A storage object in a bucket */
export const StorageObjectSchema = z.object({
	bucket_name: z.string().describe('The bucket this object belongs to'),
	key: z.string().describe('Object key (path)'),
	size: z.number().int().describe('Object size in bytes'),
	etag: z.string().optional().describe('Object ETag'),
	content_type: z.string().optional().describe('Object content type'),
	last_modified: z.string().optional().describe('Last modified timestamp (ISO8601)'),
});

/** Paginated list of storage objects */
export const StorageListResponseSchema = z.object({
	objects: z.array(StorageObjectSchema).describe('List of objects'),
	total: z.number().int().describe('Total count matching the query'),
	prefix: z.string().describe('Prefix filter applied'),
	limit: z.number().int().describe('Page size'),
	offset: z.number().int().describe('Page offset'),
});

/** Delete response */
export const StorageDeleteResponseSchema = z.object({
	deleted_count: z.number().int().describe('Number of objects deleted'),
});

/** Presigned URL response */
export const StoragePresignResponseSchema = z.object({
	presigned_url: z.string().describe('The presigned URL'),
	expiry_seconds: z.number().int().describe('URL expiry time in seconds'),
});

/** Bucket stats response */
export const StorageStatsResponseSchema = z.object({
	bucket_name: z.string().describe('The bucket name'),
	object_count: z.number().int().describe('Number of objects'),
	total_size: z.number().int().describe('Total size in bytes'),
	last_event_at: z.string().optional().describe('Last event timestamp (ISO8601)'),
});

export type StorageObject = z.infer<typeof StorageObjectSchema>;
export type StorageListResponse = z.infer<typeof StorageListResponseSchema>;
export type StorageDeleteResponse = z.infer<typeof StorageDeleteResponseSchema>;
export type StoragePresignResponse = z.infer<typeof StoragePresignResponseSchema>;
export type StorageStatsResponse = z.infer<typeof StorageStatsResponseSchema>;
