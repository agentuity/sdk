import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createWebhookAPIClient, getWebhookApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import {
	createWebhookDestination,
	listWebhookDestinations,
	updateWebhookDestination,
	deleteWebhookDestination,
	WebhookDestinationSchema,
	type WebhookDestination,
} from '@agentuity/server';

const DestinationsListResponseSchema = z.object({
	destinations: z.array(
		z.object({
			id: z.string(),
			type: z.string(),
			config: z.record(z.string(), z.unknown()),
			created_at: z.string(),
		})
	),
});

const listDestinationsSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List destinations for a webhook',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook destinations list wh_abc123'),
			description: 'List webhook destinations',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
		}),
		response: DestinationsListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createWebhookAPIClient(ctx);
		const destinations = await listWebhookDestinations(
			client,
			args.webhook_id,
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			if (destinations.length === 0) {
				tui.info('No destinations configured');
			} else {
				const tableData = destinations.map((d: WebhookDestination) => ({
					ID: d.id,
					Type: d.type,
					Config: JSON.stringify(d.config),
					Created: new Date(d.created_at).toLocaleString(),
				}));
				tui.table(tableData, ['ID', 'Type', 'Config', 'Created']);
			}
		}

		return {
			destinations: destinations.map((d: WebhookDestination) => ({
				id: d.id,
				type: d.type,
				config: d.config,
				created_at: d.created_at,
			})),
		};
	},
});

const createDestinationSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a destination for a webhook',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud webhook destinations create wh_abc123 --type url --config \'{"url":"https://example.com/webhook"}\''
			),
			description: 'Create a URL destination',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
		}),
		options: z.object({
			type: z.enum(['url']).default('url').describe('Destination type'),
			config: z.string().describe('Destination configuration as JSON'),
		}),
		response: WebhookDestinationSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createWebhookAPIClient(ctx);

		let config: Record<string, unknown>;
		try {
			config = JSON.parse(opts.config);
		} catch {
			tui.fatal('Invalid JSON for --config option', ErrorCode.INVALID_ARGUMENT);
		}

		const destination = await createWebhookDestination(
			client,
			args.webhook_id,
			{
				type: opts.type,
				config,
			},
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Created destination: ${destination.id}`);
			console.log(`  Type:   ${destination.type}`);
			console.log(`  Config: ${JSON.stringify(destination.config)}`);
		}

		return destination;
	},
});

const updateDestinationSubcommand = createSubcommand({
	name: 'update',
	description: 'Update a webhook destination',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud webhook destinations update wh_abc123 whds_def456 --config \'{"url":"https://example.com/v2"}\''
			),
			description: 'Update a destination config',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
			destination_id: z.string().min(1).describe('Destination ID'),
		}),
		options: z.object({
			config: z.string().optional().describe('Updated destination configuration as JSON'),
		}),
		response: WebhookDestinationSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createWebhookAPIClient(ctx);

		const updateParams: { config?: Record<string, unknown> } = {};

		if (opts.config) {
			try {
				updateParams.config = JSON.parse(opts.config);
			} catch {
				tui.fatal('Invalid JSON for --config option', ErrorCode.INVALID_ARGUMENT);
			}
		}

		const destination = await updateWebhookDestination(
			client,
			args.webhook_id,
			args.destination_id,
			updateParams,
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Updated destination: ${destination.id}`);
			console.log(`  Config: ${JSON.stringify(destination.config)}`);
		}

		return destination;
	},
});

const DeleteDestinationResponseSchema = z.object({
	success: z.boolean(),
	webhook_id: z.string(),
	destination_id: z.string(),
});

const deleteDestinationSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm'],
	description: 'Delete a destination from a webhook',
	tags: ['mutating', 'deletes-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook destinations delete wh_abc123 whds_def456 --confirm'),
			description: 'Delete a destination',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
			destination_id: z.string().min(1).describe('Destination ID'),
		}),
		options: z.object({
			confirm: z.boolean().default(false).describe('Skip confirmation prompt'),
		}),
		response: DeleteDestinationResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;

		if (!opts.confirm) {
			tui.fatal('Use --confirm to confirm destination deletion', ErrorCode.INVALID_ARGUMENT);
		}

		const client = await createWebhookAPIClient(ctx);
		await deleteWebhookDestination(
			client,
			args.webhook_id,
			args.destination_id,
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Deleted destination: ${args.destination_id}`);
		}

		return {
			success: true,
			webhook_id: args.webhook_id,
			destination_id: args.destination_id,
		};
	},
});

export const destinationsSubcommand = createCommand({
	name: 'destinations',
	aliases: ['dest'],
	description: 'Manage webhook destinations',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook destinations list wh_abc123'),
			description: 'List destinations',
		},
		{
			command: getCommand(
				'cloud webhook destinations create wh_abc123 --config \'{"url":"https://example.com/webhook"}\''
			),
			description: 'Create a destination',
		},
	],
	subcommands: [
		listDestinationsSubcommand,
		createDestinationSubcommand,
		updateDestinationSubcommand,
		deleteDestinationSubcommand,
	],
});

export default destinationsSubcommand;
