import { createRouter } from '@agentuity/server';

const router = createRouter();

router.stream('/', (c) => {
	return c.agent.readableStream.run('hello world');
});

export default router;
