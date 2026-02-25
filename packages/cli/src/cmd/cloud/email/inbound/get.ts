import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createEmailAdapter } from '../util';

const EmailInboundSchema = z.object({
	id: z.string(),
	from: z.string(),
	to: z.string(),
	subject: z.string().optional(),
	text: z.string().optional(),
	status: z.string().optional(),
	received_at: z.string().optional(),
});

function truncate(value: string | undefined, length = 200): string {
	if (!value) {
		return '-';
	}
	return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

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
						Status: inbound.status ?? '-',
						Received: inbound.received_at
							? new Date(inbound.received_at).toLocaleString()
							: '-',
					},
				],
				['ID', 'From', 'To', 'Subject', 'Text', 'Status', 'Received'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return inbound;
	},
});

export default getSubcommand;
