import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', (c) => {
	return c.text('Hi from foo');
});

export default router;
