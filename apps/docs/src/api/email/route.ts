/**
 * Email Route - Send templated emails.
 *
 * POST / - Send an email using a template
 */
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { EMAIL_ADDRESS_SCHEMA } from '../../lib/email-templates';
import emailAgent from '../../agent/email/agent';

type EmailServiceLike = {
	getOutbound(id: string): Promise<{ status?: string; error?: string } | null>;
};

type EmailDeliveryState = 'queued' | 'delivered' | 'failed';

const OUTBOUND_POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 750;
const EmailDemoRequestSchema = s.object({
	template: s.literal('welcome'),
	to: EMAIL_ADDRESS_SCHEMA,
});

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function waitForOutboundStatus(email: EmailServiceLike, outboundId: string) {
	let outbound = await email.getOutbound(outboundId);

	for (let attempt = 0; attempt < OUTBOUND_POLL_ATTEMPTS; attempt += 1) {
		if (!outbound || (outbound.status && outbound.status !== 'pending')) {
			return outbound;
		}

		await sleep(POLL_INTERVAL_MS);
		outbound = await email.getOutbound(outboundId);
	}

	return outbound;
}

const router = new Hono<Env>().post('/', async (c) => {
	try {
		const body = await c.req.json<unknown>();
		const parsed = EmailDemoRequestSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: 'Enter a valid email address to send this demo.' }, 400);
		}
		const data = parsed.data;

		const result = await emailAgent.run({
			...data,
			to: data.to.trim(),
		});

		let outbound = null;
		try {
			outbound = await waitForOutboundStatus(c.var.email, result.id);
		} catch (error) {
			c.var.logger.warn('Email demo delivery check failed', {
				error: error instanceof Error ? error.message : String(error),
				emailId: result.id,
			});
		}

		let deliveryState: EmailDeliveryState = 'queued';
		if (outbound?.status === 'failed') {
			deliveryState = 'failed';
		} else if (outbound?.status === 'success') {
			deliveryState = 'delivered';
		}

		return c.json({
			...result,
			status: outbound?.status ?? result.status,
			deliveryState,
			deliveryError: outbound?.error ?? null,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to send email';
		// SyntaxError means the request body was not valid JSON — that's a client error
		if (err instanceof SyntaxError) {
			return c.json({ error: message }, 400);
		}
		return c.json({ error: message }, 500);
	}
});

export default router;
