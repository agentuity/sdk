import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.post('/upsert', async (c) => {
	const result = await c.vector.upsert('test-namespace', {
		key: 'test-key',
		embeddings: [0.1, 0.2, 0.3],
	});
	return c.json(result);
});

router.get('/get', async (c) => {
	const result = await c.vector.get('test-namespace', 'test-key');
	return c.json(result);
});

router.post('/get-many', async (c) => {
	const result = await c.vector.getMany('test-namespace', 'key1', 'key2');
	const resultArray = Array.from(result.entries()).map(([_key, value]) => value);
	return c.json(resultArray);
});

router.post('/search', async (c) => {
	const result = await c.vector.search('test-namespace', {
		query: 'test query',
		limit: 10,
	});
	return c.json(result);
});

router.delete('/delete', async (c) => {
	await c.vector.delete('test-namespace', 'test-key');
	return c.json({ success: true });
});

router.get('/exists', async (c) => {
	const result = await c.vector.exists('test-namespace');
	return c.json({ success: result });
});

export default router;
