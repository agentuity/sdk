import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createEmailAdapter } from '../util';

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

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List sent emails',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true },
	schema: {
		options: z.object({
			addressId: z.string().optional().describe('Filter by email address ID'),
		}),
		response: z.array(EmailOutboundSchema),
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const email = createEmailAdapter(ctx);
		const outbound = await email.listOutbound(opts.addressId);

		if (!options.json) {
			tui.table(
				outbound.map((item) => ({
					ID: item.id,
					From: item.from,
					To: item.to,
					Subject: item.subject ?? '-',
					Status: item.status ?? '-',
					Sent: item.sent_at ? new Date(item.sent_at).toLocaleString() : '-',
				})),
				[
					{ name: 'ID', alignment: 'left' },
					{ name: 'From', alignment: 'left' },
					{ name: 'To', alignment: 'left' },
					{ name: 'Subject', alignment: 'left' },
					{ name: 'Status', alignment: 'left' },
					{ name: 'Sent', alignment: 'left' },
				]
			);
		}

		return outbound;
	},
});

export default listSubcommand;
