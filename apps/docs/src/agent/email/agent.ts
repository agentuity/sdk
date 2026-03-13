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
 *
 * Docs: https://agentuity.dev/services/email
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import {
	EMAIL_FROM,
	EMAIL_NAME,
	EMAIL_TO,
	generateEmailContent,
	type EmailTemplateId,
} from '../../lib/email-templates';

const agent = createAgent('email-sender', {
	description: 'Send templated emails via the Agentuity email service',

	schema: {
		input: s.object({
			template: s.string(),
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

	handler: async (ctx, { template }) => {
		const { subject, html, text } = generateEmailContent(template as EmailTemplateId, EMAIL_NAME);

		ctx.logger.info('Sending email', { template, subject });

		const result = await ctx.email.send({
			from: EMAIL_FROM,
			to: EMAIL_TO,
			subject,
			html,
			text,
		});

		ctx.logger.info('Email sent', { id: result.id, status: result.status });

		return {
			id: result.id,
			status: result.status ?? 'pending',
			subject,
			to: EMAIL_TO,
			from: EMAIL_FROM,
			html,
		};
	},
});

export default agent;
