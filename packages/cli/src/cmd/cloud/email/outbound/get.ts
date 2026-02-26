import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createEmailAdapter, truncate } from '../util';
import { EmailOutboundSchema } from './schemas';

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get a sent email by ID',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			id: z.string().min(1).describe('Outbound email ID (eout_*)'),
		}),
		response: EmailOutboundSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const email = createEmailAdapter(ctx);
		const outbound = await email.getOutbound(args.id);

		if (!outbound) {
			tui.fatal(`Outbound email not found: ${args.id}`);
		}

		if (!options.json) {
			tui.success(`Outbound Email: ${tui.bold(outbound.id)}`);
			tui.table(
				[
					{
						ID: outbound.id,
						From: outbound.from,
						To: outbound.to,
						Subject: outbound.subject ?? '-',
						Text: truncate(outbound.text),
						Status: outbound.status ?? '-',
						Error: outbound.error ?? '-',
						Created: outbound.created_at
							? new Date(outbound.created_at).toLocaleString()
							: '-',
					},
				],
				['ID', 'From', 'To', 'Subject', 'Text', 'Status', 'Error', 'Created'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return outbound;
	},
});

export default getSubcommand;
