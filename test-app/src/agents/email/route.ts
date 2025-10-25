import { createRouter } from '@agentuity/server';

const router = createRouter();

router.email('foo@example.com', async (c) => {
	const email = await c.email();
	const text = await c.agent.email.run({
		from: email.address,
		message: email.text,
	});
	return c.text(text);
});

export default router;
