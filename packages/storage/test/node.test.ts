import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createS3Client } from '../src/node.ts';
import { bucketConfigFromEnv } from '../src/types.ts';

interface CapturedState {
	readonly clientConfigs: unknown[];
	readonly commands: S3Command[];
}

const captured: CapturedState = {
	clientConfigs: [],
	commands: [],
};

class S3Command {
	readonly input: unknown;

	constructor(input: unknown) {
		this.input = input;
	}
}

mock.module('@aws-sdk/client-s3', () => {
	class S3Client {
		constructor(config: unknown) {
			captured.clientConfigs.push(config);
		}

		async send(command: S3Command): Promise<Record<string, unknown>> {
			captured.commands.push(command);
			return { Contents: [], IsTruncated: false };
		}
	}

	return {
		S3Client,
		ListObjectsV2Command: S3Command,
		HeadObjectCommand: S3Command,
		GetObjectCommand: S3Command,
		PutObjectCommand: S3Command,
		DeleteObjectCommand: S3Command,
	};
});

describe('Node S3 client endpoint resolution', () => {
	beforeEach(() => {
		captured.clientConfigs.length = 0;
		captured.commands.length = 0;
	});

	test('uses shared endpoint plus Bucket for linked bucket env vars', async () => {
		const storage = createS3Client(
			bucketConfigFromEnv({
				AWS_BUCKET: 'example-bucket',
				AWS_ENDPOINT: 'https://example-bucket.storage.example.test',
				AWS_ACCESS_KEY_ID: 'access',
				AWS_SECRET_ACCESS_KEY: 'secret',
			})
		);

		await storage.list({ prefix: 'sdk-explorer/', maxKeys: 1 });

		expect(captured.clientConfigs).toHaveLength(1);
		expect(captured.clientConfigs).toContainEqual(
			expect.objectContaining({
				endpoint: 'https://storage.example.test',
				forcePathStyle: false,
			})
		);
		expect(captured.commands).toContainEqual({
			input: expect.objectContaining({
				Bucket: 'example-bucket',
				Prefix: 'sdk-explorer/',
				MaxKeys: 1,
			}),
		});
	});

	test('rejects configs that mix endpoint and host bucket forms', () => {
		expect(() =>
			createS3Client({
				endpoint: 'https://example-bucket.storage.example.test',
				host: 'storage.example.test',
				bucket: 'example-bucket',
				access_key: 'access',
				secret_key: 'secret',
			})
		).toThrow('BucketConfig accepts either `endpoint` or `host`+`bucket`, not both.');
	});
});
