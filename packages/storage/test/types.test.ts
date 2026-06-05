import { describe, expect, test } from 'bun:test';
import { bucketConfigFromEnv, resolveEndpoint } from '../src/types.ts';

describe('bucketConfigFromEnv', () => {
	test('resolves shared AWS_ENDPOINT with bucket name', () => {
		const config = bucketConfigFromEnv({
			AWS_BUCKET: 'example-bucket',
			AWS_ENDPOINT: 'https://storage.example.test',
			AWS_ACCESS_KEY_ID: 'access',
			AWS_SECRET_ACCESS_KEY: 'secret',
		});

		expect(resolveEndpoint(config)).toBe('https://example-bucket.storage.example.test');
	});

	test('resolves bucket-scoped AWS_ENDPOINT without duplicating the bucket', () => {
		const config = bucketConfigFromEnv({
			AWS_BUCKET: 'example-bucket',
			AWS_ENDPOINT: 'https://example-bucket.storage.example.test',
			AWS_ACCESS_KEY_ID: 'access',
			AWS_SECRET_ACCESS_KEY: 'secret',
		});

		expect(resolveEndpoint(config)).toBe('https://example-bucket.storage.example.test');
	});
});
