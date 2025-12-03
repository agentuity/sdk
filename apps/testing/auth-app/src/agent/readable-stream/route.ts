import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.stream('/', (c) => {
	return c.agent.readableStream.run('hello world');
});

export default router;
