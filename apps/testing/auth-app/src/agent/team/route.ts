import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const result = await c.agent.team.run({ action: 'info' });
	return c.json(result);
});

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.run(data);
	return c.json(result);
});

export default router;
