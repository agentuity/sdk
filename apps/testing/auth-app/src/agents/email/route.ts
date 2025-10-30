import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.email('foo@example.com', async (c) => {
	const email = await (c as any).email();
	const text = await c.agent.email.run({
		from: email.address,
		message: email.text,
	});
	return c.text(text);
});

export default router;
