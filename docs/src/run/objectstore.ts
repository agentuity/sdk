/**
 * Standalone run script for Object Storage demo
 *
 * Uses @agentuity/storage so the sandbox matches the public example. The
 * client reads linked bucket credentials from AWS_* environment variables.
 *
 * Usage: bun run src/run/objectstore.ts '{}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import { bucketConfigFromEnv, createS3Client } from '@agentuity/storage';

const ctx = getDemoContext();

const key = `sdk-explorer/demo-${Date.now()}.txt`;
const content = `Hello from Object Storage!\nTimestamp: ${new Date().toISOString()}`;

try {
	const storage = createS3Client(bucketConfigFromEnv());

	ctx.logger.info('Writing file');

	const bytesWritten = await storage.write(key, content, { type: 'text/plain' });

	ctx.logger.info('Reading file');

	const file = storage.file(key);
	const readContent = await file.text();
	const stat = await storage.stat(key);

	ctx.logger.info('Deleting file');

	await storage.delete(key);

	writeSandboxOutput(
		[
			`Write: "${key}"`,
			`  Content: ${content.split('\n')[0]}...`,
			`  Bytes written: ${bytesWritten}`,
			`Read: "${key}"`,
			`  Content: ${readContent.split('\n')[0]}...`,
			`  Size: ${stat.size}`,
			`Deleted: "${key}"`,
		].join('\n')
	);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
