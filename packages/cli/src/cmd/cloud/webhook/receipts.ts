import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createWebhookAPIClient, getWebhookApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import {
	listWebhookReceipts,
	getWebhookReceipt,
	WebhookReceiptSchema,
	type WebhookReceipt,
} from '@agentuity/server';

const ReceiptsListResponseSchema = z.object({
	receipts: z.array(
		z.object({
			id: z.string(),
			date: z.string(),
			webhook_id: z.string(),
		})
	),
});

const listReceiptsSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List receipts for a webhook',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook receipts list wh_abc123'),
			description: 'List webhook receipts',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
		}),
		options: z.object({
			limit: z.coerce
				.number()
				.min(0)
				.optional()
				.describe('Maximum number of receipts to return'),
			offset: z.coerce.number().min(0).optional().describe('Offset for pagination'),
		}),
		response: ReceiptsListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createWebhookAPIClient(ctx);
		const result = await listWebhookReceipts(
			client,
			args.webhook_id,
			{
				limit: opts.limit,
				offset: opts.offset,
			},
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			if (result.receipts.length === 0) {
				tui.info('No receipts found');
			} else {
				const tableData = result.receipts.map((r: WebhookReceipt) => ({
					ID: r.id,
					Date: new Date(r.date).toLocaleString(),
					'Webhook ID': r.webhook_id,
				}));
				tui.table(tableData, ['ID', 'Date', 'Webhook ID']);
			}
		}

		return {
			receipts: result.receipts.map((r: WebhookReceipt) => ({
				id: r.id,
				date: r.date,
				webhook_id: r.webhook_id,
			})),
		};
	},
});

const getReceiptSubcommand = createSubcommand({
	name: 'get',
	description: 'Get receipt details',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook receipts get wh_abc123 whrc_def456'),
			description: 'Get receipt details',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
			receipt_id: z.string().min(1).describe('Receipt ID'),
		}),
		response: WebhookReceiptSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createWebhookAPIClient(ctx);
		const receipt = await getWebhookReceipt(
			client,
			args.webhook_id,
			args.receipt_id,
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			const details: Record<string, unknown> = {
				ID: receipt.id,
				Date: new Date(receipt.date).toLocaleString(),
				'Webhook ID': receipt.webhook_id,
			};

			tui.table([details], undefined, { layout: 'vertical' });

			tui.newline();
			tui.header('Headers');
			tui.json(receipt.headers);

			tui.newline();
			tui.header('Payload');
			if (typeof receipt.payload === 'string') {
				try {
					const decoded = Buffer.from(receipt.payload, 'base64').toString('utf-8');
					try {
						tui.json(JSON.parse(decoded));
					} catch {
						console.log(decoded);
					}
				} catch {
					tui.json(receipt.payload);
				}
			} else {
				tui.json(receipt.payload);
			}
		}

		return receipt;
	},
});

export const receiptsSubcommand = createCommand({
	name: 'receipts',
	description: 'Manage webhook receipts',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook receipts list wh_abc123'),
			description: 'List receipts',
		},
		{
			command: getCommand('cloud webhook receipts get wh_abc123 whrc_def456'),
			description: 'Get receipt details',
		},
	],
	subcommands: [listReceiptsSubcommand, getReceiptSubcommand],
});

export default receiptsSubcommand;
