import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createEmailAdapter, truncate } from '../util';
import { EmailInboundSchema } from './schemas';

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get a received email by ID',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			id: z.string().min(1).describe('Inbound email ID (ein_*)'),
		}),
		response: EmailInboundSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const email = createEmailAdapter(ctx);
		const inbound = await email.getInbound(args.id);

		if (!inbound) {
			tui.fatal(`Inbound email not found: ${args.id}`);
		}

		if (!options.json) {
			tui.success(`Inbound Email: ${tui.bold(inbound.id)}`);
			tui.table(
				[
					{
						ID: inbound.id,
						From: inbound.from,
						To: inbound.to,
						Subject: inbound.subject ?? '-',
						Text: truncate(inbound.text),
						Received: inbound.received_at
							? new Date(inbound.received_at).toLocaleString()
							: '-',
					},
				],
				['ID', 'From', 'To', 'Subject', 'Text', 'Received'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return inbound;
	},
});

export default getSubcommand;
