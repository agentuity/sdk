import { S3Client } from 'bun';

/**
 * Creates an S3Client configured for Agentuity storage buckets
 *
 * Agentuity provides bucket-specific endpoints in virtual-hosted-style format.
 * The endpoint is already bucket-specific (e.g., bucket-name.agentuity.run),
 * so we use virtualHostedStyle: true WITHOUT passing a bucket parameter.
 *
 * @param bucket - Bucket configuration with endpoint, credentials, and region
 * @returns Configured S3Client instance
 */
export function createS3Client(bucket: {
	endpoint: string;
	access_key: string;
	secret_key: string;
	region?: string | null;
}): S3Client {
	return new S3Client({
		endpoint: bucket.endpoint.startsWith('http') ? bucket.endpoint : `https://${bucket.endpoint}`,
		accessKeyId: bucket.access_key,
		secretAccessKey: bucket.secret_key,
		region: bucket.region || 'auto',
		virtualHostedStyle: true,
	});
}
