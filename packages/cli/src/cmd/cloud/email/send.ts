import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { EmailAttachment } from '@agentuity/core';
import { getContentType } from '@agentuity/server';
import { z } from 'zod';
import { pathExists } from '../../../node-compat/fs.ts';
import * as tui from '../../../tui.ts';
import { createCommand } from '../../../types.ts';
import { EmailOutboundSchema } from './outbound/schemas.ts';
import { createEmailAdapter, truncate } from './util.ts';

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
		response: EmailOutboundSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;

		if (!opts.text && !opts.html) {
			tui.fatal('At least one of --text or --html is required');
		}

		const fileValues = Array.isArray(opts.file) ? opts.file : opts.file ? [opts.file] : [];

		const attachments: EmailAttachment[] = [];
		for (const filePath of fileValues) {
			if (!(await pathExists(filePath))) {
				tui.fatal(`Attachment file not found: ${filePath}`);
			}

			const buffer = await readFile(filePath);
			attachments.push({
				filename: basename(filePath),
				contentType: getContentType(filePath) || 'application/octet-stream',
				content: buffer.toString('base64'),
			});
		}

		const email = await createEmailAdapter(ctx);
		const outbound = await email.send({
			to: [args.to],
			from: opts.from,
			subject: opts.subject,
			text: opts.text,
			html: opts.html,
			attachments: attachments.length > 0 ? attachments : undefined,
		});

		if (!options.json) {
			tui.success('Email queued for delivery');
			tui.table(
				[
					{
						ID: outbound.id,
						From: outbound.from || opts.from,
						To: outbound.to || args.to,
						Subject: outbound.subject ?? opts.subject,
						Text: truncate(outbound.text ?? opts.text),
						Status: outbound.status ?? 'pending',
						Attachments: attachments.length > 0 ? attachments.length.toString() : '-',
					},
				],
				['ID', 'From', 'To', 'Subject', 'Text', 'Status', 'Attachments'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return outbound;
	},
});

export default sendSubcommand;
