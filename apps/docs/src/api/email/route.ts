/**
 * Email Route - Send templated emails.
 *
 * POST / - Send an email using a template
 */
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import { EMAIL_REGEX } from '../../lib/email-templates';
import emailAgent from '../../agent/email/agent';

const router = new Hono<Env>().post('/', async (c) => {
	try {
		const data = await c.req.json<{ template: 'welcome'; to?: string }>();

		if (data.to && !EMAIL_REGEX.test(data.to)) {
			return c.json({ error: `Invalid email format: ${data.to}` }, 400);
		}

		const result = await emailAgent.run(data);
		return c.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to send email';
		// JSON parse errors and missing required fields are client errors
		if (err instanceof SyntaxError || message.includes('expected')) {
			return c.json({ error: message }, 400);
		}
		return c.json({ error: message }, 500);
	}
});

export default router;
