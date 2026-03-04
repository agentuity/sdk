import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import {
	listConsumers,
	type Consumer,
} from '@agentuity/server';

const ConsumersListResponseSchema = z.object({
	consumers: z.array(
		z.object({
			id: z.string(),
			client_id: z.string().nullable().optional(),
			durable: z.boolean(),
			connected: z.boolean(),
			ip_address: z.string().nullable().optional(),
			last_offset: z.number().nullable().optional(),
		})
	),
});

const listConsumersSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List consumers for a queue',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue consumers list my-queue'),
			description: 'List queue consumers',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		response: ConsumersListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const consumers = await listConsumers(client, args.queue_name, getQueueApiOptions(ctx));

		if (!options.json) {
			if (consumers.length === 0) {
				tui.info('No consumers connected');
			} else {
				const tableData = consumers.map((c: Consumer) => ({
					ID: c.id,
					'Client ID': c.client_id || '-',
					Durable: c.durable ? 'Yes' : 'No',
					Connected: c.disconnected_at ? 'No' : 'Yes',
					'IP Address': c.ip_address || '-',
					'Last Offset': c.last_offset != null ? String(c.last_offset) : '-',
				}));
				tui.table(tableData, ['ID', 'Client ID', 'Durable', 'Connected', 'IP Address', 'Last Offset']);
			}
		}

		return {
			consumers: consumers.map((c: Consumer) => ({
				id: c.id,
				client_id: c.client_id || null,
				durable: c.durable,
				connected: !c.disconnected_at,
				ip_address: c.ip_address || null,
				last_offset: c.last_offset ?? null,
			})),
		};
	},
});

export const consumersSubcommand = createCommand({
	name: 'consumers',
	aliases: ['consumer'],
	description: 'Manage queue consumers (WebSocket subscriptions)',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue consumers list my-queue'),
			description: 'List consumers',
		},
	],
	subcommands: [
		listConsumersSubcommand,
	],
});

export default consumersSubcommand;
