import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.cron('0 0 * * *', async (c) => {
	c.var.logger.debug('cron triggered');
	await c.agent.cron.run();
	return c.status(201);
});

export default router;
