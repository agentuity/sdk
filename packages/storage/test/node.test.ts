import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { createS3Client } from '../src/node.ts';
import { bucketConfigFromEnv } from '../src/types.ts';

interface CapturedState {
	readonly clientConfigs: unknown[];
	readonly commands: S3Command[];
	/** Bytes drained from each upload command's `Body`, in call order. */
	readonly uploadedBodies: Uint8Array[];
}

const captured: CapturedState = {
	clientConfigs: [],
	commands: [],
	uploadedBodies: [],
};

class S3Command {
	readonly input: unknown;

	constructor(input: unknown) {
		this.input = input;
	}
}

/**
 * Drain a mocked upload `Body` into bytes, mirroring what the real S3
 * SDK reads off the wire. Handles fixed bodies and the Node `Readable`
 * that `node.ts` produces for streaming uploads.
 */
async function drainBody(body: unknown): Promise<Uint8Array> {
	if (body == null) return new Uint8Array();
	if (typeof body === 'string') return new Uint8Array(Buffer.from(body, 'utf-8'));
	if (body instanceof Uint8Array) return new Uint8Array(body);
	const chunks: Buffer[] = [];
	for await (const chunk of body as AsyncIterable<Buffer>) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return new Uint8Array(Buffer.concat(chunks));
}

mock.module('@aws-sdk/client-s3', () => {
	class S3Client {
		constructor(config: unknown) {
			captured.clientConfigs.push(config);
		}

		async send(command: S3Command): Promise<Record<string, unknown>> {
			captured.commands.push(command);
			const input = command.input as { Body?: unknown } | null;
			if (input && 'Body' in input && input.Body != null) {
				captured.uploadedBodies.push(await drainBody(input.Body));
			}
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

	test('splits explicit bucket-scoped endpoint for the AWS SDK', async () => {
		const storage = createS3Client({
			endpoint: 'https://example-bucket.storage.example.test',
			access_key: 'access',
			secret_key: 'secret',
		});

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

	test('rejects explicit endpoints without a bucket label', () => {
		expect(() =>
			createS3Client({
				endpoint: 'https://localhost',
				access_key: 'access',
				secret_key: 'secret',
			})
		).toThrow(
			'Bucket endpoint must be bucket-scoped as `<bucket>.<host>`, got host `localhost` from endpoint `https://localhost`.'
		);
	});

	test('rejects malformed explicit endpoint URLs', () => {
		expect(() =>
			createS3Client({
				endpoint: 'https://',
				access_key: 'access',
				secret_key: 'secret',
			})
		).toThrow('Invalid bucket endpoint URL: https://');
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

describe('Node S3 client upload body handling', () => {
	beforeEach(() => {
		captured.clientConfigs.length = 0;
		captured.commands.length = 0;
		captured.uploadedBodies.length = 0;
	});

	test('streams a Web ReadableStream body as exact bytes (parity with the Bun fix)', async () => {
		const storage = createS3Client({
			endpoint: 'https://example-bucket.storage.example.test',
			access_key: 'access',
			secret_key: 'secret',
		});
		// Length deliberately != 23 so a "[object ReadableStream]" corruption
		// would be unmistakable.
		const payload = new TextEncoder().encode('node-stream-payload-ABCDEFGHIJKLMNOP-0123456789\n');
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(payload);
				controller.close();
			},
		});

		const wrote = await storage.write('obj.txt', stream, { type: 'text/plain' });

		// node.ts streams via a counting passthrough: both the returned byte
		// count and the bytes that reach PutObjectCommand.Body must equal the
		// payload — never the 23-byte string Bun would have stored.
		expect(wrote).toBe(payload.byteLength);
		expect(captured.uploadedBodies).toHaveLength(1);
		const sent = captured.uploadedBodies[0];
		expect(sent).toEqual(payload);
	});
});
