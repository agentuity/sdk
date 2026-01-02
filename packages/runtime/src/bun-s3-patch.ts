/**
 * Bun S3 monkey-patch for Agentuity storage endpoints
 *
 * Agentuity storage uses virtual-hosted-style URLs (e.g., ag-{id}.t3.storage.dev).
 * Bun's default s3 export uses path-style addressing, causing bucket path mismatch.
 *
 * This module patches Bun.S3Client.prototype methods to automatically set
 * virtualHostedStyle: true when S3_ENDPOINT matches *.storage.dev
 *
 * Patched methods:
 * - file(path, options?) - S3Options
 * - presign(path, options?) - S3FilePresignOptions
 * - write(path, data, options?) - S3Options
 * - delete(path, options?) - S3Options
 * - exists(path, options?) - S3Options
 * - stat(path, options?) - S3Options
 * - size(path, options?) - S3Options
 * - unlink(path, options?) - S3Options
 * - list(input?, options?) - options type doesn't include virtualHostedStyle but we inject it anyway
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
 * Helper to inject virtualHostedStyle into options if not already set
 */
function injectVirtualHostedStyle(options?: Record<string, unknown>): Record<string, unknown> {
	if (!options || typeof options.virtualHostedStyle === 'undefined') {
		return { ...options, virtualHostedStyle: true };
	}
	return options;
}

/**
 * Patch Bun's S3Client to automatically use virtualHostedStyle for storage.dev endpoints
 *
 * This function:
 * 1. Checks if we're running in Bun with S3 support
 * 2. Checks if S3_ENDPOINT (or AWS_ENDPOINT) points to *.storage.dev
 * 3. Patches S3Client.prototype methods to inject virtualHostedStyle: true
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
						presign?: (path: string, options?: Record<string, unknown>) => unknown;
						write?: (
							path: string,
							data: unknown,
							options?: Record<string, unknown>
						) => unknown;
						delete?: (path: string, options?: Record<string, unknown>) => unknown;
						exists?: (path: string, options?: Record<string, unknown>) => unknown;
						stat?: (path: string, options?: Record<string, unknown>) => unknown;
						size?: (path: string, options?: Record<string, unknown>) => unknown;
						unlink?: (path: string, options?: Record<string, unknown>) => unknown;
						list?: (
							input?: Record<string, unknown> | null,
							options?: Record<string, unknown>
						) => unknown;
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

	// Patch file(path, options?)
	const originalFile = S3ClientProto.file!;
	S3ClientProto.file = function patchedFile(
		this: unknown,
		path: string,
		options?: Record<string, unknown>
	): unknown {
		return originalFile.call(this, path, injectVirtualHostedStyle(options));
	};

	// Patch presign(path, options?)
	if (S3ClientProto.presign) {
		const originalPresign = S3ClientProto.presign;
		S3ClientProto.presign = function patchedPresign(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		): unknown {
			return originalPresign.call(this, path, injectVirtualHostedStyle(options));
		};
	}

	// Patch write(path, data, options?)
	if (S3ClientProto.write) {
		const originalWrite = S3ClientProto.write;
		S3ClientProto.write = function patchedWrite(
			this: unknown,
			path: string,
			data: unknown,
			options?: Record<string, unknown>
		): unknown {
			return originalWrite.call(this, path, data, injectVirtualHostedStyle(options));
		};
	}

	// Patch delete(path, options?)
	if (S3ClientProto.delete) {
		const originalDelete = S3ClientProto.delete;
		S3ClientProto.delete = function patchedDelete(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		): unknown {
			return originalDelete.call(this, path, injectVirtualHostedStyle(options));
		};
	}

	// Patch exists(path, options?)
	if (S3ClientProto.exists) {
		const originalExists = S3ClientProto.exists;
		S3ClientProto.exists = function patchedExists(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		): unknown {
			return originalExists.call(this, path, injectVirtualHostedStyle(options));
		};
	}

	// Patch stat(path, options?)
	if (S3ClientProto.stat) {
		const originalStat = S3ClientProto.stat;
		S3ClientProto.stat = function patchedStat(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		): unknown {
			return originalStat.call(this, path, injectVirtualHostedStyle(options));
		};
	}

	// Patch size(path, options?)
	if (S3ClientProto.size) {
		const originalSize = S3ClientProto.size;
		S3ClientProto.size = function patchedSize(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		): unknown {
			return originalSize.call(this, path, injectVirtualHostedStyle(options));
		};
	}

	// Patch unlink(path, options?)
	if (S3ClientProto.unlink) {
		const originalUnlink = S3ClientProto.unlink;
		S3ClientProto.unlink = function patchedUnlink(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		): unknown {
			return originalUnlink.call(this, path, injectVirtualHostedStyle(options));
		};
	}

	// Patch list(input?, options?)
	// Note: The TypeScript type for list's options doesn't include virtualHostedStyle,
	// but we inject it anyway as the underlying implementation may still use it
	if (S3ClientProto.list) {
		const originalList = S3ClientProto.list;
		S3ClientProto.list = function patchedList(
			this: unknown,
			input?: Record<string, unknown> | null,
			options?: Record<string, unknown>
		): unknown {
			return originalList.call(this, input, injectVirtualHostedStyle(options));
		};
	}

	S3ClientProto[PATCHED_SYMBOL] = true;
}
