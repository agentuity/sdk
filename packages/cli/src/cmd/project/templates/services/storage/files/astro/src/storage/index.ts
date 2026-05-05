import { createS3Client, type BucketConfig } from '@agentuity/storage';

function bucketConfig(): BucketConfig {
	const endpoint = process.env.AGENTUITY_BUCKET_ENDPOINT;
	const access_key = process.env.AGENTUITY_BUCKET_ACCESS_KEY;
	const secret_key = process.env.AGENTUITY_BUCKET_SECRET_KEY;
	if (!endpoint || !access_key || !secret_key) {
		throw new Error(
			'AGENTUITY_BUCKET_* env vars are not set. Provision an Agentuity bucket or set them manually.'
		);
	}
	return { endpoint, access_key, secret_key };
}

export const s3 = createS3Client(bucketConfig());
