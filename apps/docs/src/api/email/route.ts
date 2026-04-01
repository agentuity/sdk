/**
 * Email Route - Send templated emails.
 *
 * POST / - Send an email using a template
 */
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import emailAgent from '../../agent/email/agent';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = new Hono<Env>().post('/', async (c) => {
	const data = await c.req.json();
	if (data.to && !EMAIL_REGEX.test(data.to)) {
		return c.json({ error: `Invalid email format: ${data.to}` }, 400);
	}
	try {
		const result = await emailAgent.run(data);
		return c.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to send email';
		return c.json({ error: message }, 400);
	}
});

export default router;
