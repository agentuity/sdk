import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.state.run(data);
	return c.json(result);
});

export default router;
