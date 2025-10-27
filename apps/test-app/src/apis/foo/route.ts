import { createRouter } from '@agentuity/server';

const router = createRouter();

router.get('/', (c) => {
	return c.text('Hi from foo');
});

export default router;
