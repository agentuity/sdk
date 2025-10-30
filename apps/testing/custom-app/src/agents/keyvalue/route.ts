import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/get', async (c) => {
	const result = await c.kv.get('test-namespace', 'test-key');
	return c.json(result);
});

router.post('/set', async (c) => {
	await c.kv.set('test-namespace', 'test-key', { test: 'data' });
	return c.json({ success: true });
});

router.delete('/delete', async (c) => {
	await c.kv.delete('test-namespace', 'test-key');
	return c.json({ success: true });
});

export default router;
