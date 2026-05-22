/**
 * Storage smoke test.
 *
 * Uploads, lists, stats, downloads, and deletes a single object so we
 * can confirm `@agentuity/storage` works end-to-end against a real
 * bucket. Runs under both Bun and Node — see README.md.
 */

import { createS3Client } from '@agentuity/storage';

interface TestEnv {
	endpoint: string;
	access_key: string;
	secret_key: string;
	region?: string;
}

function loadEnv(): TestEnv {
	const endpoint = process.env.AGENTUITY_STORAGE_ENDPOINT;
	const access_key = process.env.AGENTUITY_STORAGE_ACCESS_KEY;
	const secret_key = process.env.AGENTUITY_STORAGE_SECRET_KEY;
	if (!endpoint || !access_key || !secret_key) {
		console.error('❌ Missing required environment variables.');
		console.error(
			'   Set AGENTUITY_STORAGE_ENDPOINT, AGENTUITY_STORAGE_ACCESS_KEY, and AGENTUITY_STORAGE_SECRET_KEY.'
		);
		console.error('   See ./README.md for instructions.');
		process.exit(1);
	}
	return {
		endpoint,
		access_key,
		secret_key,
		region: process.env.AGENTUITY_STORAGE_REGION,
	};
}

function detectRuntime(): 'bun' | 'node' {
	// Bun sets `Bun` as a global; Node does not.
	return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined' ? 'bun' : 'node';
}

async function main() {
	const runtime = detectRuntime();
	console.log(`🚀 Storage smoke test`);
	console.log(`   Runtime: ${runtime}`);
	console.log(``);

	const env = loadEnv();
	const s3 = createS3Client({
		endpoint: env.endpoint,
		access_key: env.access_key,
		secret_key: env.secret_key,
		region: env.region,
	});

	// Use a timestamped prefix so concurrent runs do not collide.
	const prefix = `storage-test/${Date.now()}-${runtime}/`;
	const key = `${prefix}hello.txt`;
	const payload = `Hello from the ${runtime} backend at ${new Date().toISOString()}`;

	let cleanupKey: string | null = null;

	try {
		// 1. Upload (exercises write() + counting passthrough on Node).
		console.log(`📤 Uploading ${key} (${payload.length} bytes)...`);
		const bytesUploaded = await s3.write(key, payload, { type: 'text/plain' });
		cleanupKey = key;
		const expected = new TextEncoder().encode(payload).byteLength;
		if (bytesUploaded !== expected) {
			throw new Error(`bytes-uploaded mismatch: expected ${expected}, got ${bytesUploaded}`);
		}
		console.log(`✅ Uploaded ${bytesUploaded} bytes`);

		// 2. List with prefix (exercises list() + lastModified normalization).
		console.log(`\n📋 Listing with prefix ${prefix}...`);
		const list = await s3.list({ prefix });
		if (list.contents.length !== 1) {
			throw new Error(`expected exactly 1 object under ${prefix}, got ${list.contents.length}`);
		}
		const entry = list.contents[0]!;
		console.log(
			`✅ Found 1 object: ${entry.key} (${entry.size} bytes, modified ${entry.lastModified})`
		);
		if (entry.key !== key) {
			throw new Error(`unexpected key in list: ${entry.key}`);
		}
		if (typeof entry.lastModified !== 'string') {
			throw new Error(`lastModified should be ISO string, got ${typeof entry.lastModified}`);
		}

		// 3. Stat (exercises stat() / HEAD).
		console.log(`\n📏 Stat...`);
		const stat = await s3.stat(key);
		console.log(
			`✅ size=${stat.size} type=${stat.type ?? '?'} lastModified=${stat.lastModified?.toISOString() ?? '?'}`
		);
		if (stat.size !== expected) {
			throw new Error(`stat size mismatch: expected ${expected}, got ${stat.size}`);
		}

		// 4. Download as text (exercises file().text() / GET).
		console.log(`\n📥 Downloading as text...`);
		const text = await s3.file(key).text();
		if (text !== payload) {
			throw new Error(
				`payload round-trip mismatch.\n  expected: ${payload}\n  got:      ${text}`
			);
		}
		console.log(`✅ Round-trip matched (${text.length} chars)`);

		// 5. Download as ArrayBuffer (exercises file().arrayBuffer()).
		console.log(`\n📥 Downloading as ArrayBuffer...`);
		const ab = await s3.file(key).arrayBuffer();
		const decoded = new TextDecoder().decode(ab);
		if (decoded !== payload) {
			throw new Error('arrayBuffer round-trip mismatch');
		}
		console.log(`✅ ArrayBuffer matched (${ab.byteLength} bytes)`);

		// 6. Download as stream (exercises file().stream()).
		console.log(`\n📥 Downloading as stream...`);
		const stream = s3.file(key).stream();
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
		const streamed = new TextDecoder().decode(concatChunks(chunks));
		if (streamed !== payload) {
			throw new Error('stream round-trip mismatch');
		}
		console.log(`✅ Stream matched (${chunks.length} chunk(s))`);

		// 7. Delete (exercises delete()).
		console.log(`\n🗑️  Deleting ${key}...`);
		await s3.delete(key);
		cleanupKey = null;
		console.log(`✅ Deleted`);

		// 8. Verify deletion via list.
		console.log(`\n🔍 Verifying deletion...`);
		const after = await s3.list({ prefix });
		if (after.contents.length !== 0) {
			throw new Error(
				`expected prefix to be empty after delete, found ${after.contents.length} object(s)`
			);
		}
		console.log(`✅ Prefix is empty`);

		console.log(`\n✨ Storage test passed under ${runtime} runtime\n`);
	} finally {
		// Best-effort cleanup if anything failed mid-run.
		if (cleanupKey) {
			try {
				await s3.delete(cleanupKey);
				console.error(`(cleanup) deleted ${cleanupKey}`);
			} catch (err) {
				console.error(`(cleanup) failed to delete ${cleanupKey}:`, err);
			}
		}
	}
}

function concatChunks(parts: Uint8Array[]): Uint8Array {
	let total = 0;
	for (const p of parts) total += p.byteLength;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.byteLength;
	}
	return out;
}

main().catch((error) => {
	console.error('❌ Error:', error instanceof Error ? error.message : error);
	if (error instanceof Error && error.stack) {
		console.error(error.stack);
	}
	process.exit(1);
});
