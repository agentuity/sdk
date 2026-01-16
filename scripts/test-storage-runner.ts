#!/usr/bin/env bun
/**
 * Storage S3 Patch Integration Test - Test Runner
 *
 * This script runs the actual S3 tests. It expects environment variables
 * to be set at process init time (not via process.env at runtime).
 *
 * Expected environment variables (set by parent process):
 *   - AWS_ENDPOINT
 *   - AWS_ACCESS_KEY_ID
 *   - AWS_SECRET_ACCESS_KEY
 *   - AWS_REGION (optional)
 *   - AWS_BUCKET (optional)
 *
 * This script is spawned by test-storage.ts with credentials in the environment.
 */

import { S3Client } from 'bun';
import { patchBunS3ForStorageDev } from '@agentuity/runtime';

interface TestResult {
	name: string;
	passed: boolean;
	error?: string;
	duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
	const start = performance.now();
	try {
		await fn();
		results.push({ name, passed: true, duration: performance.now() - start });
		console.log(`  ✓ ${name}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		results.push({ name, passed: false, error: message, duration: performance.now() - start });
		console.log(`  ✗ ${name}: ${message}`);
	}
}

async function main() {
	// Verify environment variables are set
	const endpoint = process.env.AWS_ENDPOINT;
	const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

	console.log('Environment check:');
	console.log(`  AWS_ENDPOINT:          ${endpoint ? '✓ set' : '✗ not set'}`);
	console.log(`  AWS_ACCESS_KEY_ID:     ${accessKeyId ? '✓ set' : '✗ not set'}`);
	console.log(`  AWS_SECRET_ACCESS_KEY: ${secretAccessKey ? '✓ set' : '✗ not set'}`);
	console.log('');

	if (!endpoint || !accessKeyId || !secretAccessKey) {
		console.error('Error: Required S3 environment variables are not set');
		process.exit(1);
	}

	// Apply the S3 patch
	console.log('Applying Bun S3 patch...');
	patchBunS3ForStorageDev();
	console.log('  Patch applied successfully');
	console.log('');

	// Create S3 client WITHOUT explicit credentials
	// Bun should auto-load from environment variables
	console.log('Creating S3Client (credentials from environment)...');
	const s3Client = new S3Client();
	console.log('  S3Client created');
	console.log('');

	// Run S3 tests
	console.log('Running S3 method tests:');
	console.log('');

	const testKey = `test-${Date.now()}.txt`;
	const testContent = 'Hello from Agentuity S3 patch test!';

	// Test write()
	await runTest('write() - upload file', async () => {
		const bytesWritten = await s3Client.write(testKey, testContent);
		if (bytesWritten !== testContent.length) {
			throw new Error(`Expected ${testContent.length} bytes, got ${bytesWritten}`);
		}
	});

	// Test exists()
	await runTest('exists() - check file exists', async () => {
		const exists = await s3Client.exists(testKey);
		if (!exists) {
			throw new Error('File should exist after write');
		}
	});

	// Test stat()
	await runTest('stat() - get file metadata', async () => {
		const stat = await s3Client.stat(testKey);
		if (!stat) {
			throw new Error('stat() returned null');
		}
		if (stat.size !== testContent.length) {
			throw new Error(`Expected size ${testContent.length}, got ${stat.size}`);
		}
	});

	// Test size()
	await runTest('size() - get file size', async () => {
		const size = await s3Client.size(testKey);
		if (size !== testContent.length) {
			throw new Error(`Expected size ${testContent.length}, got ${size}`);
		}
	});

	// Test file() - read back
	await runTest('file() - read file content', async () => {
		const file = s3Client.file(testKey);
		const content = await file.text();
		if (content !== testContent) {
			throw new Error(`Content mismatch: expected "${testContent}", got "${content}"`);
		}
	});

	// Test presign()
	await runTest('presign() - generate presigned URL', async () => {
		const url = s3Client.presign(testKey, { expiresIn: 3600 });
		if (!url || typeof url !== 'string') {
			throw new Error('presign() should return a string URL');
		}
		if (!url.startsWith('https://')) {
			throw new Error(`Expected https URL, got: ${url}`);
		}
	});

	// Test list()
	await runTest('list() - list objects', async () => {
		const result = await s3Client.list({ prefix: 'test-' });
		if (!result || !result.contents) {
			throw new Error('list() should return contents array');
		}
		const found = result.contents.some((obj: { key?: string }) => obj.key === testKey);
		if (!found) {
			throw new Error(`Test file ${testKey} not found in list results`);
		}
	});

	// Test delete()
	await runTest('delete() - delete file', async () => {
		await s3Client.delete(testKey);
		const exists = await s3Client.exists(testKey);
		if (exists) {
			throw new Error('File should not exist after delete');
		}
	});

	// Test unlink() (alias for delete)
	const testKey2 = `test-unlink-${Date.now()}.txt`;
	await runTest('unlink() - delete file (alias)', async () => {
		await s3Client.write(testKey2, 'test content');
		await s3Client.unlink(testKey2);
		const exists = await s3Client.exists(testKey2);
		if (exists) {
			throw new Error('File should not exist after unlink');
		}
	});

	// Print summary
	console.log('');
	console.log('═══════════════════════════════════════════════');
	console.log('Test Summary');
	console.log('═══════════════════════════════════════════════');

	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

	console.log(`  Total:  ${results.length}`);
	console.log(`  Passed: ${passed}`);
	console.log(`  Failed: ${failed}`);
	console.log(`  Duration: ${totalDuration.toFixed(2)}ms`);
	console.log('');

	if (failed > 0) {
		console.log('Failed tests:');
		for (const result of results.filter((r) => !r.passed)) {
			console.log(`  - ${result.name}: ${result.error}`);
		}
		process.exit(1);
	}

	console.log('✅ All tests passed!');
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
