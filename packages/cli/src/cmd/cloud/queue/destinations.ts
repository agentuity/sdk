import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import {
	createDestination,
	listDestinations,
	updateDestination,
	deleteDestination,
	DestinationSchema,
	DestinationAlreadyExistsError,
	type Destination,
} from '@agentuity/server';

const DestinationsListResponseSchema = z.object({
	destinations: z.array(
		z.object({
			id: z.string(),
			destination_type: z.string(),
			url: z.string(),
			enabled: z.boolean(),
			created_at: z.string(),
		})
	),
});

const listDestinationsSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List destinations for a queue',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue destinations list my-queue'),
			description: 'List queue destinations',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		response: DestinationsListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const destinations = await listDestinations(client, args.queue_name, getQueueApiOptions(ctx));

		if (!options.json) {
			if (destinations.length === 0) {
				tui.info('No destinations configured');
			} else {
				const tableData = destinations.map((d: Destination) => ({
					ID: d.id,
					Type: d.destination_type,
					URL: d.config.url,
					Enabled: d.enabled ? 'Yes' : 'No',
					Created: new Date(d.created_at).toLocaleString(),
				}));
				tui.table(tableData, ['ID', 'Type', 'URL', 'Enabled', 'Created']);
			}
		}

		return {
			destinations: destinations.map((d: Destination) => ({
				id: d.id,
				destination_type: d.destination_type,
				url: d.config.url,
				enabled: d.enabled,
				created_at: d.created_at,
			})),
		};
	},
});

const createDestinationSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a webhook destination for a queue',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud queue destinations create my-queue --url https://example.com/webhook'
			),
			description: 'Create a webhook destination',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		options: z.object({
			url: z.string().url().describe('Webhook URL'),
			method: z.string().default('POST').optional().describe('HTTP method (default: POST)'),
			timeout: z.coerce.number().optional().describe('Request timeout in milliseconds'),
		}),
		response: DestinationSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		try {
			const destination = await createDestination(
				client,
				args.queue_name,
				{
					destination_type: 'http',
					config: {
						url: opts.url,
						method: opts.method || 'POST',
						timeout_ms: opts.timeout ?? 30000,
					},
					enabled: true,
				},
				getQueueApiOptions(ctx)
			);

			if (!options.json) {
				tui.success(`Created destination: ${destination.id}`);
				console.log(`  URL:    ${destination.config.url}`);
				console.log(`  Method: ${destination.config.method}`);
			}

			return destination;
		} catch (error) {
			if (error instanceof DestinationAlreadyExistsError) {
				tui.error(
					`A destination with URL "${opts.url}" already exists for queue "${args.queue_name}"`
				);
				tui.info('Hint: Use a different URL or delete the existing destination first');
				process.exit(1);
			}
			throw error;
		}
	},
});

const updateDestinationSubcommand = createSubcommand({
	name: 'update',
	description: 'Update a destination',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue destinations update my-queue dest_abc123 --enabled=false'),
			description: 'Disable a destination',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			destination_id: z.string().min(1).describe('Destination ID'),
		}),
		options: z.object({
			url: z.string().url().optional().describe('Webhook URL'),
			method: z.string().optional().describe('HTTP method'),
			timeout: z.coerce.number().optional().describe('Request timeout in milliseconds'),
			enabled: z.boolean().optional().describe('Enable or disable the destination'),
		}),
		response: DestinationSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		const updateParams: {
			config?: { url?: string; method?: string; timeout_ms?: number };
			enabled?: boolean;
		} = {};

		if (opts.url || opts.method || opts.timeout !== undefined) {
			updateParams.config = {};
			if (opts.url) updateParams.config.url = opts.url;
			if (opts.method) updateParams.config.method = opts.method;
			if (opts.timeout !== undefined) updateParams.config.timeout_ms = opts.timeout;
		}
		if (opts.enabled !== undefined) updateParams.enabled = opts.enabled;

		const destination = await updateDestination(
			client,
			args.queue_name,
			args.destination_id,
			updateParams,
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Updated destination: ${destination.id}`);
			console.log(`  URL:     ${destination.config.url}`);
			console.log(`  Enabled: ${destination.enabled ? 'Yes' : 'No'}`);
		}

		return destination;
	},
});

const DeleteDestinationResponseSchema = z.object({
	success: z.boolean(),
	queue_name: z.string(),
	destination_id: z.string(),
});

const deleteDestinationSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm'],
	description: 'Delete a destination from a queue',
	tags: ['mutating', 'deletes-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue destinations delete my-queue dest-123'),
			description: 'Delete a destination',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			destination_id: z.string().min(1).describe('Destination ID'),
		}),
		response: DeleteDestinationResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		await deleteDestination(
			client,
			args.queue_name,
			args.destination_id,
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Deleted destination: ${args.destination_id}`);
		}

		return {
			success: true,
			queue_name: args.queue_name,
			destination_id: args.destination_id,
		};
	},
});

export const destinationsSubcommand = createCommand({
	name: 'destinations',
	aliases: ['dest'],
	description: 'Manage queue destinations (webhooks)',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue destinations list my-queue'),
			description: 'List destinations',
		},
		{
			command: getCommand(
				'cloud queue destinations create my-queue --url https://example.com/webhook'
			),
			description: 'Create a webhook destination',
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
