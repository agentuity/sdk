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

	beforeEach(() => {
		delete process.env.S3_ENDPOINT;
		delete process.env.AWS_ENDPOINT;
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
});
