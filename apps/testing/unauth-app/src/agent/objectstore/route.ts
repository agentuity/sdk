import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/get', async (c) => {
	await c.objectstore.get('test-bucket', 'test-key');
	return c.json({ success: true });
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
	// Need to create the object first since delete was called before
	const data = new TextEncoder().encode('test data for url');
	await c.objectstore.put('test-bucket', 'test-key-url', data);
	const url = await c.objectstore.createPublicURL('test-bucket', 'test-key-url');
	return c.json({ success: true, url });
});

export default router;
