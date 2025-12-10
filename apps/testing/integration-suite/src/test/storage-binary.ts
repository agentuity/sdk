/**
 * Binary Storage Tests
 *
 * Tests binary data upload/download with integrity verification:
 * - Random binary data (various sizes)
 * - Null bytes and high bytes
 * - PDF files
 * - Content-Type preservation
 * - MD5 hash verification
 */

import { test } from '@test/suite';
import { assert, assertEqual, assertDefined, uniqueId } from '@test/helpers';
import binaryStorageAgent from '@agents/storage/binary/upload-download';
import crypto from 'crypto';

// Helper: Generate random binary data
function generateRandomBytes(size: number): Uint8Array {
	return crypto.randomBytes(size);
}

// Helper: Calculate MD5 hash
function md5(data: Uint8Array): string {
	return crypto.createHash('md5').update(data).digest('hex');
}

// Helper: Create minimal PDF
function createMinimalPDF(): Uint8Array {
	const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
306
%%EOF`;
	return new TextEncoder().encode(pdf);
}

// Test 1: Random binary data (1KB)
test('storage-binary', 'random-1kb', async () => {
	const name = uniqueId('binary-1kb');
	const data = generateRandomBytes(1024);
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
		contentType: 'application/octet-stream',
	});

	assertEqual(uploadResult.success, true);
	assertEqual(uploadResult.md5, expectedMd5);
	assertEqual(uploadResult.size, 1024);
	assertDefined(uploadResult.streamId);

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.success, true);
	assertEqual(downloadResult.md5, expectedMd5);
	assertEqual(downloadResult.size, 1024);

	// Verify data matches
	const downloadedData = new Uint8Array(downloadResult.data);
	assert(downloadedData.length === data.length, 'Data length mismatch');
	assert(
		downloadedData.every((byte, i) => byte === data[i]),
		'Data content mismatch'
	);
});

// Test 2: Random binary data (10KB)
test('storage-binary', 'random-10kb', async () => {
	const name = uniqueId('binary-10kb');
	const data = generateRandomBytes(10 * 1024);
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.success, true);
	assertEqual(uploadResult.md5, expectedMd5);

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);
});

// Test 3: Random binary data (100KB)
test('storage-binary', 'random-100kb', async () => {
	const name = uniqueId('binary-100kb');
	const data = generateRandomBytes(100 * 1024);
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.md5, expectedMd5);

	// Download and verify
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);
});

// Test 4: Null bytes (0x00)
test('storage-binary', 'null-bytes', async () => {
	const name = uniqueId('binary-nulls');
	const data = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.md5, expectedMd5);

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);

	// Verify exact bytes
	const downloadedData = new Uint8Array(downloadResult.data);
	assert(
		downloadedData.every((byte) => byte === 0x00),
		'Null bytes corrupted'
	);
});

// Test 5: High bytes (0xFF)
test('storage-binary', 'high-bytes', async () => {
	const name = uniqueId('binary-highs');
	const data = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]);
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.md5, expectedMd5);

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);

	// Verify exact bytes
	const downloadedData = new Uint8Array(downloadResult.data);
	assert(
		downloadedData.every((byte) => byte === 0xff),
		'High bytes corrupted'
	);
});

// Test 6: Mixed problematic bytes
test('storage-binary', 'problematic-bytes', async () => {
	const name = uniqueId('binary-problematic');
	const data = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x7f, 0x00, 0xff]);
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.md5, expectedMd5);

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);

	// Verify byte-by-byte
	const downloadedData = new Uint8Array(downloadResult.data);
	assert(downloadedData.length === data.length, 'Byte count mismatch');
	assert(
		downloadedData.every((byte, i) => byte === data[i]),
		'Byte-by-byte mismatch'
	);
});

// Test 7: PDF upload/download
test('storage-binary', 'pdf-upload', async () => {
	const name = uniqueId('binary-pdf');
	const data = createMinimalPDF();
	const expectedMd5 = md5(data);

	// Upload with PDF content type
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
		contentType: 'application/pdf',
	});

	assertEqual(uploadResult.success, true);
	assertEqual(uploadResult.md5, expectedMd5);
	assertEqual(uploadResult.contentType, 'application/pdf');

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);

	// Verify PDF structure
	const downloadedData = new Uint8Array(downloadResult.data);
	const text = new TextDecoder().decode(downloadedData);
	assert(text.startsWith('%PDF-1.4'), 'PDF header missing');
	assert(text.includes('%%EOF'), 'PDF footer missing');
});

// Test 8: PDF with binary content
test('storage-binary', 'pdf-binary-content', async () => {
	const name = uniqueId('binary-pdf-complex');

	// Create PDF with some binary-like content in stream
	const pdfBytes = createMinimalPDF();
	const expectedMd5 = md5(pdfBytes);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(pdfBytes),
		contentType: 'application/pdf',
	});

	assertEqual(uploadResult.md5, expectedMd5);

	// Download and verify integrity
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);
	assertEqual(downloadResult.size, pdfBytes.length);
});

// Test 9: Content-Type preservation (octet-stream)
test('storage-binary', 'content-type-octet-stream', async () => {
	const name = uniqueId('binary-octet');
	const data = generateRandomBytes(256);

	// Upload with default content type
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
		contentType: 'application/octet-stream',
	});

	assertEqual(uploadResult.contentType, 'application/octet-stream');
});

// Test 10: Content-Type preservation (PDF)
test('storage-binary', 'content-type-pdf', async () => {
	const name = uniqueId('binary-pdf-type');
	const data = createMinimalPDF();

	// Upload with PDF content type
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
		contentType: 'application/pdf',
	});

	assertEqual(uploadResult.contentType, 'application/pdf');
});

// Test 11: Large binary file (1MB)
test('storage-binary', 'large-1mb', async () => {
	const name = uniqueId('binary-1mb');
	const data = generateRandomBytes(1024 * 1024); // 1MB
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.md5, expectedMd5);
	assertEqual(uploadResult.size, 1024 * 1024);

	// Download and verify
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);
	assertEqual(downloadResult.size, 1024 * 1024);
});

// Test 12: Empty binary data
test('storage-binary', 'empty-data', async () => {
	const name = uniqueId('binary-empty');
	const data = new Uint8Array(0);
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.md5, expectedMd5);
	assertEqual(uploadResult.size, 0);

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);
	assertEqual(downloadResult.size, 0);
});

// Test 13: Single byte
test('storage-binary', 'single-byte', async () => {
	const name = uniqueId('binary-single');
	const data = new Uint8Array([0x42]); // 'B'
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.md5, expectedMd5);

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);

	// Verify exact byte
	const downloadedData = new Uint8Array(downloadResult.data);
	assertEqual(downloadedData[0], 0x42);
});

// Test 14: Alternating bit pattern
test('storage-binary', 'bit-pattern', async () => {
	const name = uniqueId('binary-pattern');
	const data = new Uint8Array([0xaa, 0x55, 0xaa, 0x55]); // Alternating bits
	const expectedMd5 = md5(data);

	// Upload
	const uploadResult = await binaryStorageAgent.run({
		operation: 'upload',
		name,
		data: Array.from(data),
	});

	assertEqual(uploadResult.md5, expectedMd5);

	// Download
	const downloadResult = await binaryStorageAgent.run({
		operation: 'download',
		streamId: uploadResult.streamId,
	});

	assertEqual(downloadResult.md5, expectedMd5);

	// Verify pattern preserved
	const downloadedData = new Uint8Array(downloadResult.data);
	assert(
		downloadedData.every((byte, i) => byte === data[i]),
		'Bit pattern corrupted'
	);
});
