/**
 * Standalone run script for Object Storage demo
 *
 * Uses @agentuity/storage so the sandbox matches the public example. The
 * client reads linked bucket credentials from AWS_* environment variables.
 * Bun's native S3Client is used only for the presigned URL example.
 *
 * Usage: bun run src/run/objectstore.ts '{}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import {
	createObjectStorageClient,
	createObjectStoragePresignedUrl,
} from '../lib/demo-object-storage';

const ctx = getDemoContext();

// Stable key: each run overwrites the previous demo file instead of leaving
// one object per run in the shared explorer bucket (and its UI file list).
const key = 'sdk-explorer/sandbox-demo.txt';
const content = `Hello from Object Storage!\nTimestamp: ${new Date().toISOString()}`;

try {
	const storage = createObjectStorageClient();

	ctx.logger.info('Writing file');

	const bytesWritten = await storage.write(key, content, { type: 'text/plain' });

	ctx.logger.info('Reading file');

	const file = storage.file(key);
	const readContent = await file.text();
	const stat = await storage.stat(key);

	ctx.logger.info('Creating presigned URL');

	const presignedUrl = createObjectStoragePresignedUrl(key, 60 * 15);

	writeSandboxOutput(
		[
			`Write: "${key}"`,
			`  Content: ${content.split('\n')[0]}...`,
			`  Bytes written: ${bytesWritten}`,
			`Read: "${key}"`,
			`  Content: ${readContent.split('\n')[0]}...`,
			`  Size: ${stat.size}`,
			'Presign: Bun S3Client',
			`  Presigned URL: ${presignedUrl}`,
			'Delete the object after the URL no longer needs to work with storage.delete(key).',
		].join('\n')
	);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
