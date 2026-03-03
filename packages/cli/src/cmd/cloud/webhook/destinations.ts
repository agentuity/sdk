import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createWebhookAPIClient, getWebhookApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import {
	createWebhookDestination,
	listWebhookDestinations,
	updateWebhookDestination,
	deleteWebhookDestination,
	WebhookDestinationSchema,
	type WebhookDestination,
} from '@agentuity/server/index.ts';

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
				const tableData = destinations.map((d: WebhookDestination) => {
					const config =
						d.type === 'url' && d.config && typeof d.config === 'object' && 'url' in d.config
							? String((d.config as Record<string, unknown>).url)
							: JSON.stringify(d.config);
					return {
						ID: d.id,
						Type: d.type,
						URL: config,
						Created: new Date(d.created_at).toLocaleString(),
					};
				});
				tui.table(tableData, ['ID', 'Type', 'URL', 'Created']);
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

const createUrlDestinationSubcommand = createSubcommand({
	name: 'url',
	description: 'Create a URL destination for a webhook',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud webhook destinations create url wh_abc123 https://example.com/webhook'
			),
			description: 'Create a URL destination',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
			url: z.string().min(1).describe('Destination URL'),
		}),
		response: WebhookDestinationSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createWebhookAPIClient(ctx);

		const destination = await createWebhookDestination(
			client,
			args.webhook_id,
			{
				type: 'url',
				config: { url: args.url },
			},
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Created destination: ${destination.id}`);
			console.log(`  URL: ${args.url}`);
		}

		return destination;
	},
});

const createDestinationSubcommand = createCommand({
	name: 'create',
	description: 'Create a destination for a webhook',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud webhook destinations create url wh_abc123 https://example.com/webhook'
			),
			description: 'Create a URL destination',
		},
	],
	subcommands: [createUrlDestinationSubcommand],
});

const updateDestinationSubcommand = createSubcommand({
	name: 'update',
	description: 'Update a webhook destination',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud webhook destinations update wh_abc123 whds_def456 --url https://example.com/v2'
			),
			description: 'Update a destination URL',
		},
	],
	schema: {
		args: z.object({
			webhook_id: z.string().min(1).describe('Webhook ID'),
			destination_id: z.string().min(1).describe('Destination ID'),
		}),
		options: z.object({
			url: z.string().optional().describe('Updated destination URL'),
		}),
		response: WebhookDestinationSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createWebhookAPIClient(ctx);

		const updateParams: { config?: Record<string, unknown> } = {};

		if (opts.url) {
			updateParams.config = { url: opts.url };
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
			const url =
				destination.config &&
				typeof destination.config === 'object' &&
				'url' in destination.config
					? (destination.config as Record<string, unknown>).url
					: JSON.stringify(destination.config);
			console.log(`  URL: ${url}`);
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
				'cloud webhook destinations create url wh_abc123 --url https://example.com/webhook'
			),
			description: 'Create a URL destination',
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
