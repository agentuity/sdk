/**
 * Shared types for `@agentuity/storage`.
 *
 * Both the Bun-backed and Node-backed implementations conform to the
 * `S3ClientLike` interface. Callers should program against this surface
 * rather than backend-specific shapes, so that swapping the backend (or
 * letting the package conditionally pick one) is transparent.
 */

/**
 * Bucket connection configuration.
 *
 * Two addressing forms are supported:
 *
 * 1. **Pre-composed virtual-hosted endpoint**: pass `endpoint` as
 *    `<bucket>.<host>` (e.g. `my-bucket.agentuity.run`). Use this when
 *    the platform already gives you a bucket-scoped endpoint.
 *
 * 2. **Separate `bucket` + `host`**: pass them as distinct fields and
 *    `createS3Client` will compose the virtual-hosted endpoint for
 *    you. This is what Agentuity-provisioned buckets need today —
 *    the platform injects `AWS_ENDPOINT` (shared host) and
 *    `AWS_BUCKET` (per-bucket name) separately.
 *
 * Exactly one of these forms must be provided.
 */
export interface BucketConfig {
	/**
	 * Bucket-specific endpoint, e.g. `my-bucket.agentuity.run`. May be
	 * provided with or without a scheme; missing schemes default to
	 * `https://`. Mutually exclusive with `host`/`bucket`.
	 */
	endpoint?: string;
	/**
	 * Shared S3 host, e.g. `t3.storage.dev` or
	 * `https://t3.storage.dev`. When set, `bucket` is required and the
	 * virtual-hosted endpoint is composed as `<bucket>.<host>`.
	 */
	host?: string;
	/**
	 * Bucket name. Required when `host` is set; ignored when `endpoint`
	 * is set (the bucket is parsed out of the endpoint hostname).
	 */
	bucket?: string;
	/** S3 access key ID. */
	access_key: string;
	/** S3 secret access key. */
	secret_key: string;
	/** Optional region. Defaults to `'auto'` when omitted or null. */
	region?: string | null;
}

/**
 * Resolve the canonical virtual-hosted endpoint URL from a
 * `BucketConfig`, applying the `endpoint` vs `host`+`bucket` rules.
 *
 * Always returns a fully-qualified URL with a scheme (defaults to
 * `https://` when missing). Throws on invalid configurations rather
 * than silently picking a default — misconfigured storage usually
 * means the user forgot to provision/inject env vars.
 */
export function resolveEndpoint(bucket: BucketConfig): string {
	if (bucket.endpoint && (bucket.host || bucket.bucket)) {
		throw new Error('BucketConfig accepts either `endpoint` or `host`+`bucket`, not both.');
	}
	if (bucket.endpoint) {
		return bucket.endpoint.startsWith('http') ? bucket.endpoint : `https://${bucket.endpoint}`;
	}
	if (!bucket.host || !bucket.bucket) {
		throw new Error('BucketConfig requires either `endpoint` or both `host` and `bucket`.');
	}
	// Strip scheme + trailing slashes from `host` so callers can pass
	// either `t3.storage.dev` or `https://t3.storage.dev/`.
	const hostOnly = bucket.host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
	return `https://${bucket.bucket}.${hostOnly}`;
}

/**
 * Build a `BucketConfig` from environment variables.
 *
 * Uses the standard AWS naming scheme — same one the AWS SDKs and CLI
 * read — so no key translation is needed when targeting AWS or any
 * S3-compatible service. This matches what the Agentuity platform
 * injects when a bucket is provisioned:
 *
 *   `AWS_ENDPOINT` (shared host) + `AWS_BUCKET` (bucket name) +
 *   `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`,
 *   optional `AWS_REGION`.
 *
 * Throws a descriptive error when the required vars are missing so
 * callers can surface a useful message at startup or first request.
 *
 * Pass an explicit `env` (defaults to `process.env`) to make this
 * unit-testable without mutating global state.
 */
export function bucketConfigFromEnv(
	env: Record<string, string | undefined> = process.env
): BucketConfig {
	const host = env.AWS_ENDPOINT;
	const bucket = env.AWS_BUCKET;
	const access = env.AWS_ACCESS_KEY_ID;
	const secret = env.AWS_SECRET_ACCESS_KEY;
	if (host && bucket && access && secret) {
		return {
			host,
			bucket,
			access_key: access,
			secret_key: secret,
			region: env.AWS_REGION,
		};
	}

	throw new Error(
		'Storage env vars are not set. Expected AWS_ENDPOINT + AWS_BUCKET + ' +
			'AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY. Provision an Agentuity ' +
			'bucket or set them manually.'
	);
}

/** Options for `list()`. */
export interface S3ListOptions {
	/** Only return objects whose key starts with this prefix. */
	prefix?: string;
	/** Maximum number of objects to return in this response. */
	maxKeys?: number;
	/**
	 * Pagination token. If the previous `list()` call returned an
	 * `S3ListResult` with `isTruncated: true`, pass its
	 * `nextContinuationToken` here to fetch the next page.
	 */
	continuationToken?: string;
}

/** A single object entry in a list result. */
export interface S3Object {
	key: string;
	size: number;
	/**
	 * ISO 8601 timestamp string. Both backends normalize to a string so
	 * downstream code does not have to branch on `Date | string`.
	 */
	lastModified: string;
	etag?: string;
}

/** Result of a `list()` call. */
export interface S3ListResult {
	contents: S3Object[];
	isTruncated: boolean;
	/**
	 * Token to pass as `continuationToken` on the next `list()` call to
	 * fetch the next page. Undefined when `isTruncated` is `false`.
	 */
	nextContinuationToken?: string;
}

/** Result of a `stat()` (HEAD) call. */
export interface S3StatResult {
	size: number;
	/** Content-Type of the object, when present. */
	type?: string;
	lastModified?: Date;
	etag?: string;
}

/** Options for `write()`. */
export interface S3WriteOptions {
	/** Content-Type to record on the object. */
	type?: string;
}

/**
 * Anything we can upload as an object body.
 *
 * The Bun backend forwards these directly to `Bun.S3Client.write`, which
 * accepts the same shapes. The Node backend converts them to formats
 * accepted by `@aws-sdk/client-s3`'s `PutObjectCommand`.
 */
export type S3Body = string | Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array>;

/** A handle to an object on the server. Returned by `client.file(key)`. */
export interface S3FileLike {
	/**
	 * Content-Type of the object, when known.
	 *
	 * Bun's S3File populates this lazily via the underlying client; the
	 * Node backend captures it from the most recent `arrayBuffer()`,
	 * `text()`, or `stream()` call. May be `undefined` until one of
	 * those methods has been called at least once.
	 */
	readonly type: string | undefined;
	/** Read the entire object into memory as an `ArrayBuffer`. */
	arrayBuffer(): Promise<ArrayBuffer>;
	/** Read the entire object as UTF-8 text. */
	text(): Promise<string>;
	/** Get a Web `ReadableStream` for the object body. */
	stream(): ReadableStream<Uint8Array>;
}

/**
 * Unified S3 client interface.
 *
 * Implemented by both `@agentuity/storage/bun` and
 * `@agentuity/storage/node`. The surface mirrors `Bun.S3Client` so the
 * Bun backend can be a thin wrapper, and the Node backend translates
 * to `@aws-sdk/client-s3` commands.
 */
export interface S3ClientLike {
	/**
	 * List objects in the bucket. Pass `null` (or omit) to list from the
	 * root with no prefix; otherwise narrow with `{ prefix, maxKeys }`.
	 */
	list(opts?: S3ListOptions | null): Promise<S3ListResult>;
	/** Get object metadata (HEAD). */
	stat(key: string): Promise<S3StatResult>;
	/** Get a handle to an object for streaming reads. */
	file(key: string): S3FileLike;
	/**
	 * Upload an object. Returns the number of bytes written.
	 *
	 * For streaming bodies, the byte count is measured by a counting
	 * pass-through stream so that the return value is always accurate.
	 */
	write(key: string, body: S3Body, opts?: S3WriteOptions): Promise<number>;
	/** Delete an object. No-op (does not throw) if the object is absent. */
	delete(key: string): Promise<void>;
}
