/**
 * Tests for Bun S3 monkey-patch for Agentuity storage endpoints.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { isAgentuityStorageEndpoint, patchBunS3ForStorageDev } from '../src/bun-s3-patch';

describe('isAgentuityStorageEndpoint', () => {
	test('returns true for storage.dev', () => {
		expect(isAgentuityStorageEndpoint('storage.dev')).toBe(true);
	});

	test('returns true for subdomains of storage.dev', () => {
		expect(isAgentuityStorageEndpoint('t3.storage.dev')).toBe(true);
		expect(isAgentuityStorageEndpoint('ag-rx8t16b5r9e6.t3.storage.dev')).toBe(true);
		expect(isAgentuityStorageEndpoint('foo.bar.storage.dev')).toBe(true);
	});

	test('returns true for https URLs with storage.dev', () => {
		expect(isAgentuityStorageEndpoint('https://storage.dev')).toBe(true);
		expect(isAgentuityStorageEndpoint('https://t3.storage.dev')).toBe(true);
		expect(isAgentuityStorageEndpoint('https://ag-rx8t16b5r9e6.t3.storage.dev')).toBe(true);
	});

	test('returns true for URLs with paths', () => {
		expect(isAgentuityStorageEndpoint('https://ag-123.t3.storage.dev/some/path')).toBe(true);
	});

	test('returns false for non-storage.dev endpoints', () => {
		expect(isAgentuityStorageEndpoint('s3.amazonaws.com')).toBe(false);
		expect(isAgentuityStorageEndpoint('https://s3.us-east-1.amazonaws.com')).toBe(false);
		expect(isAgentuityStorageEndpoint('r2.cloudflarestorage.com')).toBe(false);
		expect(isAgentuityStorageEndpoint('localhost:9000')).toBe(false);
	});

	test('returns false for domains that contain but do not end with storage.dev', () => {
		expect(isAgentuityStorageEndpoint('storage.dev.example.com')).toBe(false);
		expect(isAgentuityStorageEndpoint('notstorage.dev')).toBe(false);
	});

	test('returns false for empty or whitespace strings', () => {
		expect(isAgentuityStorageEndpoint('')).toBe(false);
		expect(isAgentuityStorageEndpoint('   ')).toBe(false);
	});
});

describe('patchBunS3ForStorageDev', () => {
	const originalS3Endpoint = process.env.S3_ENDPOINT;
	const originalAwsEndpoint = process.env.AWS_ENDPOINT;
	const PATCHED_SYMBOL = Symbol.for('agentuity.s3.patched');

	// Store the truly original methods before any tests run
	const trulyOriginalFile = Bun.S3Client.prototype.file;
	const trulyOriginalPresign = Bun.S3Client.prototype.presign;
	const trulyOriginalWrite = Bun.S3Client.prototype.write;
	const trulyOriginalDelete = Bun.S3Client.prototype.delete;
	const trulyOriginalExists = Bun.S3Client.prototype.exists;
	const trulyOriginalStat = Bun.S3Client.prototype.stat;
	const trulyOriginalSize = Bun.S3Client.prototype.size;
	const trulyOriginalUnlink = Bun.S3Client.prototype.unlink;
	const trulyOriginalList = Bun.S3Client.prototype.list;

	beforeEach(() => {
		delete process.env.S3_ENDPOINT;
		delete process.env.AWS_ENDPOINT;
		// Reset the prototype to the truly original methods before each test
		Bun.S3Client.prototype.file = trulyOriginalFile;
		Bun.S3Client.prototype.presign = trulyOriginalPresign;
		Bun.S3Client.prototype.write = trulyOriginalWrite;
		Bun.S3Client.prototype.delete = trulyOriginalDelete;
		Bun.S3Client.prototype.exists = trulyOriginalExists;
		Bun.S3Client.prototype.stat = trulyOriginalStat;
		Bun.S3Client.prototype.size = trulyOriginalSize;
		Bun.S3Client.prototype.unlink = trulyOriginalUnlink;
		Bun.S3Client.prototype.list = trulyOriginalList;
		// Clear the patched marker
		const proto = Bun.S3Client.prototype as Record<symbol, unknown>;
		delete proto[PATCHED_SYMBOL];
	});

	afterEach(() => {
		if (originalS3Endpoint !== undefined) {
			process.env.S3_ENDPOINT = originalS3Endpoint;
		} else {
			delete process.env.S3_ENDPOINT;
		}
		if (originalAwsEndpoint !== undefined) {
			process.env.AWS_ENDPOINT = originalAwsEndpoint;
		} else {
			delete process.env.AWS_ENDPOINT;
		}
		// Restore the original methods after each test
		Bun.S3Client.prototype.file = trulyOriginalFile;
		Bun.S3Client.prototype.presign = trulyOriginalPresign;
		Bun.S3Client.prototype.write = trulyOriginalWrite;
		Bun.S3Client.prototype.delete = trulyOriginalDelete;
		Bun.S3Client.prototype.exists = trulyOriginalExists;
		Bun.S3Client.prototype.stat = trulyOriginalStat;
		Bun.S3Client.prototype.size = trulyOriginalSize;
		Bun.S3Client.prototype.unlink = trulyOriginalUnlink;
		Bun.S3Client.prototype.list = trulyOriginalList;
		// Clear the patched marker
		const proto = Bun.S3Client.prototype as Record<symbol, unknown>;
		delete proto[PATCHED_SYMBOL];
	});

	test('does not throw when Bun.s3 is not available', () => {
		expect(() => patchBunS3ForStorageDev()).not.toThrow();
	});

	test('does not throw when S3_ENDPOINT is not set', () => {
		expect(() => patchBunS3ForStorageDev()).not.toThrow();
	});

	test('does not throw when S3_ENDPOINT is not a storage.dev endpoint', () => {
		process.env.S3_ENDPOINT = 'https://s3.amazonaws.com';
		expect(() => patchBunS3ForStorageDev()).not.toThrow();
	});

	test('is idempotent - can be called multiple times safely', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';
		expect(() => {
			patchBunS3ForStorageDev();
			patchBunS3ForStorageDev();
			patchBunS3ForStorageDev();
		}).not.toThrow();
	});

	test('uses AWS_ENDPOINT as fallback when S3_ENDPOINT is not set', () => {
		process.env.AWS_ENDPOINT = 'https://ag-123.t3.storage.dev';
		expect(() => patchBunS3ForStorageDev()).not.toThrow();
	});

	test('patches Bun.S3Client.prototype when S3_ENDPOINT is storage.dev', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';
		patchBunS3ForStorageDev();

		// Verify we're running in Bun and the patch was applied
		expect(Bun).toBeDefined();
		expect(Bun.S3Client).toBeDefined();

		// Check the Symbol marker was set on the prototype
		const proto = Bun.S3Client.prototype as Record<symbol, unknown>;
		expect(proto[PATCHED_SYMBOL]).toBe(true);
	});

	test('patched file method exists and is a function', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';
		patchBunS3ForStorageDev();

		expect(typeof Bun.S3Client.prototype.file).toBe('function');
	});

	test('manual S3Client instantiation still works after patch', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';
		patchBunS3ForStorageDev();

		// Verify that manually creating an S3Client still works
		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
			endpoint: 'https://s3.us-east-1.amazonaws.com',
		});

		expect(client).toBeDefined();
		expect(typeof client.file).toBe('function');

		// The file method should work (returns an S3File reference)
		const file = client.file('test.txt');
		expect(file).toBeDefined();
	});

	test('patch applies to all S3Client instances, not just global singleton', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';
		patchBunS3ForStorageDev();

		// Manual S3Client should not be the same as Bun.s3
		const manualClient = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		expect(manualClient).not.toBe(Bun.s3);

		// But it should still use the patched file method from the prototype
		expect(manualClient.file).toBe(Bun.s3.file);
	});

	test('patched file method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;
		const originalFile = Bun.S3Client.prototype.file;

		// Wrap the ORIGINAL method BEFORE patching to capture what the patch passes
		Bun.S3Client.prototype.file = function spyFile(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return originalFile.call(this, path, options);
		};

		// Now apply the patch - it will wrap our spy
		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.file('test.txt');

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched file method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;
		const originalFile = Bun.S3Client.prototype.file;

		// Wrap the ORIGINAL method BEFORE patching to capture what the patch passes
		Bun.S3Client.prototype.file = function spyFile(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return originalFile.call(this, path, options);
		};

		// Now apply the patch - it will wrap our spy
		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.file('test.txt', { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('patched file method preserves explicit virtualHostedStyle: true', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;
		const originalFile = Bun.S3Client.prototype.file;

		// Wrap the ORIGINAL method BEFORE patching to capture what the patch passes
		Bun.S3Client.prototype.file = function spyFile(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return originalFile.call(this, path, options);
		};

		// Now apply the patch - it will wrap our spy
		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.file('test.txt', { virtualHostedStyle: true });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched file method injects virtualHostedStyle: true into existing options object', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;
		const originalFile = Bun.S3Client.prototype.file;

		Bun.S3Client.prototype.file = function spyFile(
			this: unknown,
			path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return originalFile.call(this, path, options);
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.file('test.txt', { cacheControl: 'max-age=3600' });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
		expect(capturedOptions!.cacheControl).toBe('max-age=3600');
	});

	test('patched presign method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.presign = function spyPresign(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return 'https://mock-presigned-url.example.com';
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.presign('test.txt');

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched presign method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.presign = function spyPresign(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return 'https://mock-presigned-url.example.com';
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.presign('test.txt', { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('patched write method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.write = function spyWrite(
			this: unknown,
			_path: string,
			_data: unknown,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve(11);
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.write('test.txt', 'hello world');

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched write method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.write = function spyWrite(
			this: unknown,
			_path: string,
			_data: unknown,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve(11);
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.write('test.txt', 'hello world', { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('patched list method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.list = function spyList(
			this: unknown,
			_input?: Record<string, unknown> | null,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve({ contents: [], isTruncated: false });
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.list({ prefix: 'v1-ks/' });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched list method works with no arguments', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.list = function spyList(
			this: unknown,
			_input?: Record<string, unknown> | null,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve({ contents: [], isTruncated: false });
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.list();

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched delete method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.delete = function spyDelete(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve();
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.delete('test.txt');

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched exists method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.exists = function spyExists(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve(true);
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.exists('test.txt');

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched stat method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.stat = function spyStat(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve({
				size: 0,
				etag: '',
				lastModified: new Date(),
				type: 'text/plain',
			});
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.stat('test.txt');

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched size method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.size = function spySize(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve(0);
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.size('test.txt');

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched unlink method injects virtualHostedStyle: true when no options passed', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.unlink = function spyUnlink(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve();
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.unlink('test.txt');

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(true);
	});

	test('patched delete method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.delete = function spyDelete(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve();
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.delete('test.txt', { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('patched exists method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.exists = function spyExists(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve(true);
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.exists('test.txt', { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('patched stat method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.stat = function spyStat(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve({
				size: 0,
				etag: '',
				lastModified: new Date(),
				type: 'text/plain',
			});
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.stat('test.txt', { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('patched size method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.size = function spySize(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve(0);
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.size('test.txt', { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('patched unlink method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.unlink = function spyUnlink(
			this: unknown,
			_path: string,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve();
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.unlink('test.txt', { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('patched list method does not override explicit virtualHostedStyle: false', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';

		let capturedOptions: Record<string, unknown> | undefined;

		Bun.S3Client.prototype.list = function spyList(
			this: unknown,
			_input?: Record<string, unknown> | null,
			options?: Record<string, unknown>
		) {
			capturedOptions = options;
			return Promise.resolve({ contents: [], isTruncated: false });
		};

		patchBunS3ForStorageDev();

		const client = new Bun.S3Client({
			accessKeyId: 'test-access-key',
			secretAccessKey: 'test-secret-key',
			bucket: 'my-bucket',
		});

		client.list({ prefix: 'test/' }, { virtualHostedStyle: false });

		expect(capturedOptions).toBeDefined();
		expect(capturedOptions!.virtualHostedStyle).toBe(false);
	});

	test('all patched methods exist and are functions after patching', () => {
		process.env.S3_ENDPOINT = 'https://ag-123.t3.storage.dev';
		patchBunS3ForStorageDev();

		expect(typeof Bun.S3Client.prototype.file).toBe('function');
		expect(typeof Bun.S3Client.prototype.presign).toBe('function');
		expect(typeof Bun.S3Client.prototype.write).toBe('function');
		expect(typeof Bun.S3Client.prototype.delete).toBe('function');
		expect(typeof Bun.S3Client.prototype.exists).toBe('function');
		expect(typeof Bun.S3Client.prototype.stat).toBe('function');
		expect(typeof Bun.S3Client.prototype.size).toBe('function');
		expect(typeof Bun.S3Client.prototype.unlink).toBe('function');
		expect(typeof Bun.S3Client.prototype.list).toBe('function');
	});
});
