import { S3Client } from 'bun';
import type { S3ClientLike } from '@agentuity/storage';
import { bucketConfigFromEnv, createS3Client } from '@agentuity/storage';
import { resolveEndpoint } from '@agentuity/storage/types';

export const objectStorageNotConfiguredMessage =
	'Object storage is not configured. Link an Agentuity storage bucket or set AWS_* bucket env vars.';

function objectStorageDemoEnv(
	env: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
	// AWS_* is the public contract. S3_* is accepted only so older local
	// docs environments keep working while the visible demo copy stays canonical.
	return {
		AWS_ENDPOINT: env.AWS_ENDPOINT ?? env.S3_ENDPOINT,
		AWS_BUCKET: env.AWS_BUCKET ?? env.S3_BUCKET,
		AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID ?? env.S3_ACCESS_KEY_ID,
		AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY ?? env.S3_SECRET_ACCESS_KEY,
		AWS_REGION: env.AWS_REGION ?? env.S3_REGION,
	};
}

export function isObjectStorageConfigured(
	env: Record<string, string | undefined> = process.env
): boolean {
	const storageEnv = objectStorageDemoEnv(env);
	return Boolean(
		storageEnv.AWS_ENDPOINT &&
			storageEnv.AWS_BUCKET &&
			storageEnv.AWS_ACCESS_KEY_ID &&
			storageEnv.AWS_SECRET_ACCESS_KEY
	);
}

export function isObjectStorageConfigurationError(error: unknown): boolean {
	return error instanceof Error && error.message.includes('Storage env vars are not set');
}

export function createObjectStorageClient(): S3ClientLike {
	return createS3Client(bucketConfigFromEnv(objectStorageDemoEnv()));
}

export function createObjectStoragePresignedUrl(key: string, expiresIn: number): string {
	const bucket = bucketConfigFromEnv(objectStorageDemoEnv());
	const client = new S3Client({
		endpoint: resolveEndpoint(bucket),
		accessKeyId: bucket.access_key,
		secretAccessKey: bucket.secret_key,
		region: bucket.region || 'auto',
		virtualHostedStyle: true,
	});

	return client.presign(key, {
		expiresIn,
		method: 'GET',
	});
}
