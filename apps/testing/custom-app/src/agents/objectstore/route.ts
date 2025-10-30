import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/get', async (c) => {
	const result = await c.objectstore.get('test-bucket', 'test-key');
	if (!result.exists) {
		return c.json({ exists: false }, 404);
	}
	const text = new TextDecoder().decode(result.data);
	return c.json({ data: text, contentType: result.contentType });
});

router.post('/put', async (c) => {
	const data = new TextEncoder().encode('test data');
	await c.objectstore.put('test-bucket', 'test-key', data);
	return c.json({ success: true });
});

router.delete('/delete', async (c) => {
	await c.objectstore.delete('test-bucket', 'test-key');
	return c.json({ success: true });
});

router.get('/create-public-url', async (c) => {
	const url = await c.objectstore.createPublicURL('test-bucket', 'test-key');
	return c.json({ url });
});

export default router;
