/**
 * Bun S3 monkey-patch for Agentuity storage endpoints
 *
 * Agentuity storage uses virtual-hosted-style URLs (e.g., ag-{id}.t3.storage.dev).
 * Bun's default s3 export uses path-style addressing, causing bucket path mismatch.
 *
 * This module patches Bun.S3Client.prototype.file to automatically set
 * virtualHostedStyle: true when S3_ENDPOINT matches *.storage.dev
 */

const PATCHED_SYMBOL = Symbol.for('agentuity.s3.patched');

/**
 * Check if an endpoint is an Agentuity storage endpoint (*.storage.dev)
 */
export function isAgentuityStorageEndpoint(raw: string): boolean {
	let host = raw.trim();
	if (!host) return false;

	try {
		const url = new URL(host.includes('://') ? host : `https://${host}`);
		host = url.hostname;
	} catch {
		// raw value wasn't a URL string; treat it as host already
	}

	return host === 'storage.dev' || host.endsWith('.storage.dev');
}

/**
 * Patch Bun's S3Client to automatically use virtualHostedStyle for storage.dev endpoints
 *
 * This function:
 * 1. Checks if we're running in Bun with S3 support
 * 2. Checks if S3_ENDPOINT (or AWS_ENDPOINT) points to *.storage.dev
 * 3. Patches S3Client.prototype.file to inject virtualHostedStyle: true
 *
 * Safe to call in non-Bun environments (will no-op).
 * Idempotent (safe to call multiple times).
 */
export function patchBunS3ForStorageDev(): void {
	const bun = (globalThis as Record<string, unknown>).Bun as
		| {
				s3?: unknown;
				S3Client?: {
					prototype: {
						file?: (path: string, options?: Record<string, unknown>) => unknown;
						[PATCHED_SYMBOL]?: boolean;
					};
				};
		  }
		| undefined;

	if (!bun?.s3 || !bun.S3Client?.prototype?.file) {
		return;
	}

	const endpointEnv = process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT;
	if (!endpointEnv) {
		return;
	}

	if (!isAgentuityStorageEndpoint(endpointEnv)) {
		return;
	}

	const S3ClientProto = bun.S3Client.prototype;

	if (S3ClientProto[PATCHED_SYMBOL]) {
		return;
	}

	const originalFile = S3ClientProto.file!;

	S3ClientProto.file = function patchedFile(
		this: unknown,
		path: string,
		options?: Record<string, unknown>
	): unknown {
		let nextOptions = options;

		// Apply virtualHostedStyle to all S3Client instances when endpoint is storage.dev
		if (!nextOptions || typeof nextOptions.virtualHostedStyle === 'undefined') {
			nextOptions = { ...nextOptions, virtualHostedStyle: true };
		}

		return originalFile.call(this, path, nextOptions);
	};

	S3ClientProto[PATCHED_SYMBOL] = true;
}
