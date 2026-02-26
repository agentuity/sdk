import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createEmailAdapter } from '../util';
import { EmailInboundSchema } from './schemas';

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List received emails',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true },
	schema: {
		options: z.object({
			addressId: z.string().optional().describe('Filter by email address ID'),
		}),
		response: z.array(EmailInboundSchema),
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const email = createEmailAdapter(ctx);
		const inbound = await email.listInbound(opts.addressId);

		if (!options.json) {
			tui.table(
				inbound.map((item) => ({
					ID: item.id,
					From: item.from,
					To: item.to,
					Subject: item.subject ?? '-',
					Received: item.received_at ? new Date(item.received_at).toLocaleString() : '-',
				})),
				[
					{ name: 'ID', alignment: 'left' },
					{ name: 'From', alignment: 'left' },
					{ name: 'To', alignment: 'left' },
					{ name: 'Subject', alignment: 'left' },
					{ name: 'Received', alignment: 'left' },
				]
			);
		}

		return inbound;
	},
});

export default listSubcommand;
