/**
 * Shared types for `@agentuity/storage`.
 *
 * Both the Bun-backed and Node-backed implementations conform to the
 * `S3ClientLike` interface. Callers should program against this surface
 * rather than backend-specific shapes, so that swapping the backend (or
 * letting the package conditionally pick one) is transparent.
 */

/** Bucket connection configuration. */
export interface BucketConfig {
	/**
	 * Bucket-specific endpoint, e.g. `my-bucket.agentuity.run`. May be
	 * provided with or without a scheme; missing schemes default to
	 * `https://`.
	 */
	endpoint: string;
	/** S3 access key ID. */
	access_key: string;
	/** S3 secret access key. */
	secret_key: string;
	/** Optional region. Defaults to `'auto'` when omitted or null. */
	region?: string | null;
}

/** Options for `list()`. */
export interface S3ListOptions {
	/** Only return objects whose key starts with this prefix. */
	prefix?: string;
	/** Maximum number of objects to return in this response. */
	maxKeys?: number;
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
