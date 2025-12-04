import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const text = await c.agent.hello.run({ name: 'World' });
	return c.text(text);
});

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const text = await c.agent.hello.run(data);
	return c.text(text);
});

export default router;
