import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const text = await c.agent.sendEmail.run(data);
	return c.text(text);
});

export default router;
