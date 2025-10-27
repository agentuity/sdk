import { createRouter } from '@agentuity/server';

const router = createRouter();

router.sms({ number: '+1234567890' }, async (c) => {
	const sms = await (c as any).sms();
	const text = await c.agent.sms.run({
		number: sms.number,
		message: sms?.message || '',
	});
	return c.text(text);
});

export default router;
