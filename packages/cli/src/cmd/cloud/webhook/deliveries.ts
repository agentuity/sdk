import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createWebhookAPIClient, getWebhookApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import {
	listWebhookDeliveries,
	retryWebhookDelivery,
	WebhookDeliverySchema,
	type WebhookDelivery,
} from '@agentuity/server';

const DeliveriesListResponseSchema = z.object({
	deliveries: z.array(
		z.object({
			id: z.string(),
			date: z.string(),
			status: z.string(),
			retries: z.number(),
			webhook_destination_id: z.string(),
			error: z.string().nullable().optional(),
		})
	),
});

const listDeliveriesSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List deliveries for a webhook',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook deliveries list wh_abc123'),
			description: 'List webhook deliveries',
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
				.describe('Maximum number of deliveries to return'),
			offset: z.coerce.number().min(0).optional().describe('Offset for pagination'),
		}),
		response: DeliveriesListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createWebhookAPIClient(ctx);
		const result = await listWebhookDeliveries(
			client,
			args.webhook_id,
			{
				limit: opts.limit,
				offset: opts.offset,
			},
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			if (result.deliveries.length === 0) {
				tui.info('No deliveries found');
			} else {
				const tableData = result.deliveries.map((d: WebhookDelivery) => ({
					ID: d.id,
					Date: new Date(d.date).toLocaleString(),
					Status: d.status,
					Retries: d.retries,
					'Destination ID': d.webhook_destination_id,
					...(d.error != null ? { Error: d.error } : {}),
				}));
				const hasErrors = result.deliveries.some((d: WebhookDelivery) => d.error != null);
				tui.table(
					tableData,
					hasErrors
						? ['ID', 'Date', 'Status', 'Retries', 'Destination ID', 'Error']
						: ['ID', 'Date', 'Status', 'Retries', 'Destination ID']
				);
			}
		}

		return {
			deliveries: result.deliveries.map((d: WebhookDelivery) => ({
				id: d.id,
				date: d.date,
				status: d.status,
				retries: d.retries,
				webhook_destination_id: d.webhook_destination_id,
				...(d.error != null ? { error: d.error } : {}),
			})),
		};
	},
});

const retryDeliverySubcommand = createSubcommand({
	name: 'retry',
	description: 'Retry a failed webhook delivery',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook deliveries retry wh_abc123 whdv_def456'),
			description: 'Retry a failed delivery',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
			delivery_id: z.string().min(1).describe('Delivery ID'),
		}),
		response: WebhookDeliverySchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createWebhookAPIClient(ctx);
		const delivery = await retryWebhookDelivery(
			client,
			args.webhook_id,
			args.delivery_id,
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Retried delivery: ${tui.bold(delivery.id)}`);
			tui.table([{ ID: delivery.id, Status: delivery.status }], ['ID', 'Status'], {
				layout: 'vertical',
				padStart: '  ',
			});
		}

		return delivery;
	},
});

export const deliveriesSubcommand = createCommand({
	name: 'deliveries',
	description: 'Manage webhook deliveries',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook deliveries list wh_abc123'),
			description: 'List deliveries',
		},
		{
			command: getCommand('cloud webhook deliveries retry wh_abc123 whdv_def456'),
			description: 'Retry a failed delivery',
		},
	],
	subcommands: [listDeliveriesSubcommand, retryDeliverySubcommand],
});

export default deliveriesSubcommand;
