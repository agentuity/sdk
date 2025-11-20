import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.sms({ number: '+1234567890' }, async (c) => {
	const text = await c.agent.sms.run({
		number: '+1234567890',
		message: 'Test message',
	});
	return c.text(text);
});

export default router;
