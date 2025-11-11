import { createRouter } from '@agentuity/runtime';


const router = createRouter();

router.get('/', async (c) => {
	await c.agent.eval.noSchema.run();
	return c.json({ executed: true });
});

router.post('/', async (c) => {
	await c.agent.eval.noSchema.run();
	return c.json({ executed: true });
});

export default router;

