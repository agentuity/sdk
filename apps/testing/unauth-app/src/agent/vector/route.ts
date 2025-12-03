import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.post('/upsert', async (c) => {
	await c.vector.upsert('test-namespace', {
		key: 'test-key',
		document: 'test document content',
	});
	return c.json({ success: true });
});

router.get('/get', async (c) => {
	await c.vector.get('test-namespace', 'test-key');
	return c.json({ success: true });
});

router.post('/get-many', async (c) => {
	await c.vector.getMany('test-namespace', 'key1', 'key2');
	return c.json({ success: true });
});

router.post('/search', async (c) => {
	await c.vector.search('test-namespace', {
		query: 'test query',
		limit: 10,
	});
	return c.json({ success: true });
});

router.delete('/delete', async (c) => {
	await c.vector.delete('test-namespace', 'test-key');
	return c.json({ success: true });
});

router.get('/exists', async (c) => {
	await c.vector.exists('test-namespace');
	return c.json({ success: true });
});

export default router;
