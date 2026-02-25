import { basename } from 'node:path';
import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createEmailAdapter, type EmailOutbound } from './util';

const EmailOutboundSchema = z.object({
	id: z.string(),
	from: z.string(),
	to: z.string(),
	subject: z.string().optional(),
	text: z.string().optional(),
	html: z.string().optional(),
	status: z.string().optional(),
	error: z.string().optional(),
	sent_at: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

function truncate(value: string | undefined, length = 140): string {
	if (!value) {
		return '-';
	}
	return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

export const sendSubcommand = createCommand({
	name: 'send',
	description: 'Send an email',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			to: z.string().email().describe('Destination email address'),
		}),
		options: z.object({
			from: z.string().email().describe('Sender email address (must be owned by org)'),
			subject: z.string().min(1).describe('Email subject'),
			text: z.string().optional().describe('Plain text body'),
			html: z.string().optional().describe('HTML body'),
			file: z.array(z.string()).optional().describe('Attachment file path (repeatable)'),
		}),
		response: z.object({
			status: z.number(),
			outbound: EmailOutboundSchema,
		}),
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;

		if (!opts.from) {
			tui.fatal('--from is required');
		}
		if (!opts.subject) {
			tui.fatal('--subject is required');
		}
		if (!opts.text && !opts.html) {
			tui.fatal('At least one of --text or --html is required');
		}

		const fileValues = Array.isArray(opts.file)
			? opts.file
			: opts.file
				? [opts.file]
				: [];

		const attachments: Array<{ filename: string; content_type?: string; content_base64: string }> = [];
		for (const filePath of fileValues) {
			const file = Bun.file(filePath);
			if (!(await file.exists())) {
				tui.fatal(`Attachment file not found: ${filePath}`);
			}

			const buffer = Buffer.from(await file.arrayBuffer());
			attachments.push({
				filename: basename(filePath),
				content_type: file.type || 'application/octet-stream',
				content_base64: buffer.toString('base64'),
			});
		}

		const email = createEmailAdapter(ctx);
		const result = await email.send({
			to: args.to,
			from: opts.from,
			subject: opts.subject,
			text: opts.text,
			html: opts.html,
			attachments,
		});

		if (!options.json) {
			const outbound: EmailOutbound = result.outbound;
			tui.success('Email queued for delivery');
			tui.info(`  ID:        ${outbound.id}`);
			tui.info(`  From:      ${outbound.from}`);
			tui.info(`  To:        ${outbound.to}`);
			tui.info(`  Subject:   ${outbound.subject ?? '-'}`);
			tui.info(`  Text:      ${truncate(outbound.text)}`);
			tui.info(`  Status:    ${outbound.status ?? '-'}`);
			tui.info(`  Sent:      ${outbound.sent_at ? new Date(outbound.sent_at).toLocaleString() : '-'}`);
		}

		return result;
	},
});

export default sendSubcommand;
