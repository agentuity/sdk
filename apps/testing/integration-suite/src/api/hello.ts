import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/hello', (c) => {
	return c.json({ message: 'Hello, World!' });
});

export default router;
