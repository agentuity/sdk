import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	c.logger.info('Metadata type test agent executed');
	const result = await c.agent.metadataTypeTest.run();
	return c.json(result);
});

export default router;
