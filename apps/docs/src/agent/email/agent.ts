/**
 * Email Agent
 *
 * Sends templated emails using ctx.email.send(). Generates HTML email content
 * based on the selected template, then dispatches via the Agentuity email service.
 *
 * Key concepts:
 * - ctx.email.send() handles delivery, bounce tracking, and DNS config
 * - Email is only available when deployed (not in local dev)
 * - Templates generate inline-CSS HTML for email client compatibility
 * - Accepts an optional `to` override for sending to a user-provided address
 *
 * Docs: https://agentuity.dev/services/email
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { EMAIL_FROM, EMAIL_TO, generateEmailContent } from '../../lib/email-templates';

// Simple email format check -- no library dependency
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const agent = createAgent('email-sender', {
	description: 'Send templated emails via the Agentuity email service',

	schema: {
		input: s.object({
			template: s.literal('welcome'),
			to: s.optional(s.string()),
		}),
		output: s.object({
			id: s.string(),
			status: s.string(),
			subject: s.string(),
			to: s.array(s.string()),
			from: s.string(),
			html: s.string(),
		}),
	},

	handler: async (ctx, { template, to }) => {
		// Determine recipient: user-provided override or default self-loop address
		let recipients = EMAIL_TO;
		if (to) {
			if (!EMAIL_REGEX.test(to)) {
				throw new Error(`Invalid email format: ${to}`);
			}
			recipients = [to];
		}

		const { subject, html, text } = generateEmailContent();

		ctx.logger.info('Sending email', { template, subject, to: recipients });

		const result = await ctx.email.send({
			from: EMAIL_FROM,
			to: recipients,
			subject,
			html,
			text,
		});

		ctx.logger.info('Email sent', { id: result.id, status: result.status });

		return {
			id: result.id,
			status: result.status ?? 'pending',
			subject,
			to: recipients,
			from: EMAIL_FROM,
			html,
		};
	},
});

export default agent;
