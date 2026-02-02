import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	// TODO: add your code here - this returns a static 'hi' greeting
	return c.text('hi');
});

export default router;
