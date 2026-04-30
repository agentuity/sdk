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
import {
	EMAIL_ADDRESS_SCHEMA,
	EMAIL_FROM,
	EMAIL_TO,
	generateEmailContent,
} from '../../lib/email-templates';

const agent = createAgent('email-sender', {
	description: 'Send templated emails via the Agentuity email service',

	schema: {
		input: s.object({
			template: s.literal('welcome'),
			to: s.optional(EMAIL_ADDRESS_SCHEMA),
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
		// The left-side demo always passes a user email. Keep the Explorer inbox fallback
		// for standalone sandbox/reference runs where the code is prewritten.
		let recipients = EMAIL_TO;
		if (to) {
			recipients = [to];
		}

		const { subject, html, text } = generateEmailContent();

		ctx.logger.info('Sending email demo', { template, subject, to: recipients });

		const result = await ctx.email.send({
			from: EMAIL_FROM,
			to: recipients,
			subject,
			html,
			text,
		});

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
