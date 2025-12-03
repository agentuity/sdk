import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.post('/create', async (c) => {
	const stream = await c.stream.create('test-stream');
	return c.json({ id: stream.id, url: stream.url });
});

router.get('/list', async (c) => {
	const result = await c.stream.list();
	return c.json(result);
});

router.delete('/delete', async (c) => {
	await c.stream.delete('test-stream-id');
	return c.json({ success: true });
});

export default router;
