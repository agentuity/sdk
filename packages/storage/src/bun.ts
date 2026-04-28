/**
 * Bun-backed implementation of `S3ClientLike`.
 *
 * Thin wrapper around `Bun.S3Client`. Only resolvable when the consumer
 * is running under Bun — `package.json`'s `"bun"` exports condition
 * routes here automatically; explicit `@agentuity/storage/bun` imports
 * also land here.
 *
 * Falling through to this module under Node will fail at import time
 * because `import { S3Client } from 'bun'` is not satisfiable there.
 * That is intentional and matches the contract of the `bun` exports
 * condition.
 */

import { S3Client } from 'bun';
import type {
	BucketConfig,
	S3Body,
	S3ClientLike,
	S3FileLike,
	S3ListOptions,
	S3ListResult,
	S3StatResult,
	S3WriteOptions,
} from './types.ts';

export type { BucketConfig, S3ClientLike } from './types.ts';

/**
 * Create an S3 client backed by `Bun.S3Client`.
 *
 * Endpoints are bucket-scoped (virtual-hosted-style), so we do not pass
 * a bucket parameter on the client itself; the hostname routes to the
 * correct bucket.
 */
export function createS3Client(bucket: BucketConfig): S3ClientLike {
	const endpoint = bucket.endpoint.startsWith('http')
		? bucket.endpoint
		: `https://${bucket.endpoint}`;

	const client = new S3Client({
		endpoint,
		accessKeyId: bucket.access_key,
		secretAccessKey: bucket.secret_key,
		region: bucket.region || 'auto',
		virtualHostedStyle: true,
	});

	return {
		async list(opts?: S3ListOptions | null): Promise<S3ListResult> {
			// `Bun.S3Client.list` accepts `null` for "no filter". Translate
			// our camelCase shape (continuationToken, maxKeys) to Bun's
			// expected option keys.
			const bunOpts = opts
				? {
						prefix: opts.prefix,
						maxKeys: opts.maxKeys,
						continuationToken: opts.continuationToken,
					}
				: (null as any);
			const out = (await client.list(bunOpts)) as {
				contents?: Array<{
					key: string;
					size?: number;
					lastModified?: string | Date;
					etag?: string;
				}>;
				isTruncated?: boolean;
				nextContinuationToken?: string;
			};
			return {
				contents: (out.contents ?? []).map((o) => ({
					key: o.key,
					size: o.size ?? 0,
					lastModified: normalizeTimestamp(o.lastModified),
					etag: o.etag,
				})),
				isTruncated: out.isTruncated ?? false,
				nextContinuationToken: out.nextContinuationToken,
			};
		},

		async stat(key: string): Promise<S3StatResult> {
			const out = await client.stat(key);
			return {
				size: out.size ?? 0,
				type: out.type,
				lastModified: out.lastModified,
				// Bun's stat returns the etag with mixed casing across versions.
				etag: (out as any).etag ?? (out as any).ETag,
			};
		},

		file(key: string): S3FileLike {
			const f = client.file(key);
			return {
				// Bun's S3File exposes `type` as a getter that the underlying
				// client populates as it sees fit. Forward it directly.
				get type(): string | undefined {
					return (f as { type?: string }).type;
				},
				arrayBuffer: () => f.arrayBuffer(),
				text: () => f.text(),
				stream: () => f.stream() as ReadableStream<Uint8Array>,
			};
		},

		async write(key: string, body: S3Body, opts?: S3WriteOptions): Promise<number> {
			// `Bun.S3Client.write` accepts string, Uint8Array, ArrayBuffer,
			// Blob, ReadableStream, or Response. We accept the same shapes
			// minus Response (callers should pass the underlying stream).
			return client.write(key, body as any, opts);
		},

		async delete(key: string): Promise<void> {
			await client.delete(key);
		},
	};
}

function normalizeTimestamp(value: string | Date | undefined): string {
	if (!value) return '';
	if (typeof value === 'string') return value;
	return value.toISOString();
}
