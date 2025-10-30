import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// GET / - Show API usage documentation
router.get('/', (c) => {
	return c.json({
		message: 'Binary Object Storage Test API',
		endpoints: {
			'POST /:bucket/:key': 'Upload binary data using --data-binary',
			'GET /:bucket/:key': 'Download binary data',
			'DELETE /:bucket/:key': 'Delete object',
			'POST /:bucket/:key/public-url': 'Create a public URL for the object',
		},
		examples: {
			upload:
				'curl -X POST http://localhost:3000/api/objectstore/test-bucket/image.jpg --data-binary @photo.jpg -H "Content-Type: image/jpeg"',
			download:
				'curl http://localhost:3000/api/objectstore/test-bucket/image.jpg -o downloaded.jpg',
			delete: 'curl -X DELETE http://localhost:3000/api/objectstore/test-bucket/image.jpg',
			publicUrl:
				'curl -X POST http://localhost:3000/api/objectstore/test-bucket/image.jpg/public-url',
		},
		testBinaryIntegrity: {
			description: 'Test binary data is not corrupted',
			steps: [
				'1. Create a test file with binary data: dd if=/dev/urandom of=test.bin bs=1024 count=1',
				'2. Upload: curl -X POST http://localhost:3000/api/objectstore/test-bucket/test.bin --data-binary @test.bin',
				'3. Download: curl http://localhost:3000/api/objectstore/test-bucket/test.bin -o downloaded.bin',
				'4. Compare: diff test.bin downloaded.bin (should have no output if identical)',
				'5. Or verify checksum: md5sum test.bin downloaded.bin',
			],
		},
	});
});

// POST /:bucket/:key - Upload binary data
router.post('/:bucket/:key{.*}', async (c) => {
	const bucket = c.req.param('bucket');
	const key = c.req.param('key');

	try {
		// Get the raw binary body
		const body = await c.req.arrayBuffer();
		const data = new Uint8Array(body);

		// Get content type from header, default to application/octet-stream
		const contentType = c.req.header('content-type') || 'application/octet-stream';

		// Store in object store
		await c.objectstore.put(bucket, key, data, {
			contentType,
		});

		return c.json({
			success: true,
			message: 'Binary data uploaded successfully',
			bucket,
			key,
			size: data.length,
			contentType,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return c.json(
			{
				success: false,
				error: errorMessage,
				details: error instanceof Error ? error.stack : undefined,
			},
			500
		);
	}
});

// GET /:bucket/:key - Download binary data
router.get('/:bucket/:key{.*}', async (c) => {
	const bucket = c.req.param('bucket');
	const key = c.req.param('key');

	try {
		const result = await c.objectstore.get(bucket, key);

		if (!result.exists) {
			return c.json(
				{
					success: false,
					error: 'Object not found',
				},
				404
			);
		}

		// Return raw binary data with proper content type
		return c.body(new Uint8Array(result.data), 200, {
			'Content-Type': result.contentType,
			'Content-Length': result.data.length.toString(),
		});
	} catch (error) {
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		);
	}
});

// DELETE /:bucket/:key - Delete object
router.delete('/:bucket/:key{.*}', async (c) => {
	const bucket = c.req.param('bucket');
	const key = c.req.param('key');

	try {
		const deleted = await c.objectstore.delete(bucket, key);

		c.logger.info('Delete object result', { bucket, key, deleted });

		if (deleted) {
			return c.json({
				success: true,
				message: 'Object deleted successfully',
				bucket,
				key,
			});
		} else {
			return c.json(
				{
					success: false,
					error: 'Object not found',
				},
				404
			);
		}
	} catch (error) {
		c.logger.error('Failed to delete object', { error, bucket, key });
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		);
	}
});

// POST /:bucket/:key/public-url - Create a public URL
router.post('/:bucket/:key{.*}/public-url', async (c) => {
	const bucket = c.req.param('bucket');
	const key = c.req.param('key');

	try {
		// Optional: accept expiresDuration in request body
		let expiresDuration: number | undefined;
		try {
			const body = await c.req.json();
			expiresDuration = body.expiresDuration;
		} catch {
			// No body or invalid JSON, use default
		}

		const url = await c.objectstore.createPublicURL(bucket, key, {
			expiresDuration,
		});

		return c.json({
			success: true,
			url,
			expiresIn: expiresDuration || 3600000,
		});
	} catch (error) {
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		);
	}
});

export default router;
