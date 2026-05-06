import { bucketConfigFromEnv, createS3Client, type S3ClientLike } from '@agentuity/storage';

// Lazy singleton — defer createS3Client() until the first request so
// that build-time module evaluation (e.g. Next.js' static analysis
// pass) does not fail when env vars are absent.
let cached: S3ClientLike | undefined;
export function getS3(): S3ClientLike {
	if (!cached) cached = createS3Client(bucketConfigFromEnv());
	return cached;
}
