/**
 * Standalone run script for Object Storage demo
 *
 * Uses @agentuity/storage so the sandbox matches the public example. The
 * client reads linked bucket credentials from AWS_* environment variables.
 *
 * Usage: bun run src/run/objectstore.ts '{}'
 */
import { getDemoContext } from '../api/context';
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

	console.log('---OUTPUT---');
	console.log(`Write: "${key}"`);
	console.log(`  Content: ${content.split('\n')[0]}...`);
	console.log(`  Bytes written: ${bytesWritten}`);
	console.log(`Read: "${key}"`);
	console.log(`  Content: ${readContent.split('\n')[0]}...`);
	console.log(`  Size: ${stat.size}`);
	console.log(`Deleted: "${key}"`);
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
