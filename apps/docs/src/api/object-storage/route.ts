/**
 * Object Storage Route - File operations using Bun S3 API.
 *
 * GET /                  - Returns metadata about available operations
 * POST /seed             - Seeds sample files into sdk-explorer bucket
 * GET /download/:filename - Downloads file from object storage
 * GET /list              - Lists all files in sdk-explorer bucket
 * POST /presign/:filename - Generates presigned URL for temporary access
 */
import { createRouter } from '@agentuity/runtime';
import { S3Client } from 'bun';
import objectstoreAgent from '../../agent/objectstore/agent';

const router = createRouter();

// TODO: Replace with `import { s3 } from "bun"` once runtime S3 patch covers .list()
// Issue: https://github.com/agentuity/sdk/issues/241
const s3 = new S3Client({ virtualHostedStyle: true });

router.get('/', (c) => {
	return c.json({
		name: 'Object Storage Demo',
		description: 'File storage using Bun S3 API',
		operations: ['download', 'list', 'presign', 'seed'],
		bucket: 'sdk-explorer',
	});
});

router.post('/seed', async (c) => {
	const result = await objectstoreAgent.run({ action: 'seed' });
	return c.json(result);
});

router.get('/download/:filename', async (c) => {
	const filename = c.req.param('filename');
	const key = `sdk-explorer/${filename}`;

	try {
		const file = s3.file(key);

		if (!(await file.exists())) {
			return c.json({ error: 'File not found' }, 404);
		}

		const data = await file.arrayBuffer();
		const stat = await file.stat();

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
});

router.get('/list', async (c) => {
	try {
		const prefix = 'sdk-explorer/';
		const objects = await s3.list({ prefix, maxKeys: 100 });

		const files =
			objects.contents?.map((obj) => ({
				key: obj.key,
				filename: obj.key?.replace(prefix, '') || obj.key,
				size: obj.size,
				lastModified: obj.lastModified,
			})) || [];

		return c.json({
			success: true,
			count: files.length,
			files,
		});
	} catch (error) {
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
});

router.post('/presign/:filename', async (c) => {
	const filename = c.req.param('filename');
	const key = `sdk-explorer/${filename}`;
	// Clamp expiresIn to reasonable bounds: 60s minimum, 24 hours maximum
	const rawExpires = Number.parseInt(c.req.query('expires') || '3600', 10);
	if (Number.isNaN(rawExpires)) {
		return c.json({ error: 'Invalid expires parameter' }, 400);
	}
	const expiresIn = Math.min(Math.max(rawExpires, 60), 86400);

	try {
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
