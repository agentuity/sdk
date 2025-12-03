import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.post('/create', async (c) => {
	await c.stream.create('test-stream');
	return c.json({ success: true });
});

router.get('/list', async (c) => {
	await c.stream.list();
	return c.json({ success: true });
});

router.delete('/delete', async (c) => {
	await c.stream.delete('test-stream-id');
	return c.json({ success: true });
});

export default router;
