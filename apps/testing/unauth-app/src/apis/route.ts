import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', (c) => {
	return c.json({ message: 'Hi' });
});

export default router;
