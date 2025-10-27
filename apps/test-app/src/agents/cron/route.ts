import { createRouter } from '@agentuity/server';

const router = createRouter();

router.cron('0 0 * * *', async (c) => {
	const cron = await (c as any).cron();
	console.log('cron schedule:', cron.schedule);
	await c.agent.cron.run();
	return c.status(201);
});

export default router;
