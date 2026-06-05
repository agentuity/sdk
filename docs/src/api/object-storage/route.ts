/**
 * Object Storage Route - File operations using @agentuity/storage.
 *
 * GET /                  - Returns metadata about available operations
 * POST /seed             - Seeds sample files into sdk-explorer bucket
 * GET /download/:filename - Downloads file from object storage
 * GET /list              - Lists all files in sdk-explorer bucket
 * POST /presign/:filename - Generates presigned URL for temporary access
 */
import type { ApiEnv } from '../context';
import { s3 } from 'bun';
import type { S3ClientLike } from '@agentuity/storage';
import { bucketConfigFromEnv, createS3Client } from '@agentuity/storage';
import objectstoreAgent from '../../agent/objectstore/agent';
import { Hono } from 'hono';

function createStorage(): S3ClientLike {
	return createS3Client(bucketConfigFromEnv());
}

function isMissingObjectError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error.code === 'NoSuchKey' || error.code === 'NotFound')
	);
}

async function objectExists(storage: S3ClientLike, key: string): Promise<boolean> {
	try {
		await storage.stat(key);
		return true;
	} catch (error) {
		if (isMissingObjectError(error)) return false;
		throw error;
	}
}

const router = new Hono<ApiEnv>()

	.get('/', (c) => {
		return c.json({
			name: 'Object Storage Demo',
			description: 'File storage using @agentuity/storage',
			operations: ['download', 'list', 'presign', 'seed'],
			bucket: 'sdk-explorer',
		});
	})

	.post('/seed', async (c) => {
		const result = await objectstoreAgent.run({ action: 'seed' });
		return c.json(result);
	})

	.get('/download/:filename', async (c) => {
		const filename = c.req.param('filename');
		const key = `sdk-explorer/${filename}`;

		try {
			const storage = createStorage();

			if (!(await objectExists(storage, key))) {
				return c.json({ error: 'File not found' }, 404);
			}

			const file = storage.file(key);
			const data = await file.arrayBuffer();
			const stat = await storage.stat(key);

			return c.body(data, {
				headers: {
					'content-type': stat?.type || 'application/octet-stream',
					'content-disposition': `attachment; filename="${filename}"`,
					'content-length': String(stat?.size || data.byteLength),
				},
			});
		} catch (error) {
			c.var.logger?.error('Download failed', { error, key });
			return c.json(
				{
					error: 'Download failed',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	})

	.get('/list', async (c) => {
		try {
			const storage = createStorage();
			const prefix = 'sdk-explorer/';
			const objects = await storage.list({ prefix, maxKeys: 100 });

			const files =
				objects.contents.map((obj) => ({
					key: obj.key,
					filename: obj.key.replace(prefix, '') || obj.key,
					size: obj.size,
					lastModified: obj.lastModified,
				})) || [];

			return c.json({
				success: true,
				count: files.length,
				files,
			});
		} catch (error) {
			if (isMissingObjectError(error)) {
				return c.json({
					success: true,
					count: 0,
					files: [],
				});
			}
			c.var.logger?.error('List failed', { error });
			return c.json(
				{
					error: 'List failed',
					message: error instanceof Error ? error.message : 'Unknown error',
					files: [],
				},
				500
			);
		}
	})

	.post('/presign/:filename', async (c) => {
		const filename = c.req.param('filename');
		const key = `sdk-explorer/${filename}`;
		// Clamp expiresIn to reasonable bounds: 60s minimum, 24 hours maximum
		const rawExpires = Number.parseInt(c.req.query('expires') || '3600', 10);
		if (Number.isNaN(rawExpires)) {
			return c.json({ error: 'Invalid expires parameter' }, 400);
		}
		const expiresIn = Math.min(Math.max(rawExpires, 60), 86400);

		try {
			// `@agentuity/storage` mirrors Bun's object APIs but does not expose
			// presign yet, so this route keeps Bun's presign helper for the URL.
			const url = s3.presign(key, {
				expiresIn,
				method: 'GET',
			});

			return c.json({
				success: true,
				url,
				filename,
				expiresIn: `${expiresIn}s`,
			});
		} catch (error) {
			c.var.logger?.error('Presign failed', { error, key });
			return c.json(
				{
					error: 'Presign failed',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	});

export default router;
