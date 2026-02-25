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

function truncate(value: string | undefined, length = 200): string {
	if (!value) {
		return '-';
	}
	return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

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
						Sent: outbound.sent_at
							? new Date(outbound.sent_at).toLocaleString()
							: '-',
					},
				],
				['ID', 'From', 'To', 'Subject', 'Text', 'Status', 'Error', 'Sent'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return outbound;
	},
});

export default getSubcommand;
