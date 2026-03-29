import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import {
	createDestination,
	listDestinations,
	updateDestination,
	deleteDestination,
	DestinationSchema,
	DestinationAlreadyExistsError,
	type Destination,
} from '@agentuity/server';

// Helper to safely extract URL from any destination config type (config is a union)
function getConfigUrl(config: Destination['config']): string | undefined {
	if (config && typeof config === 'object' && 'url' in config) {
		return (config as { url: string }).url;
	}
	return undefined;
}

const DestinationsListResponseSchema = z.object({
	destinations: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			description: z.string().nullable().optional(),
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
					Name: d.name,
					Type: d.destination_type,
					URL: getConfigUrl(d.config) ?? 'N/A',
					Enabled: d.enabled ? 'Yes' : 'No',
					Created: new Date(d.created_at).toLocaleString(),
				}));
				tui.table(tableData, ['ID', 'Name', 'Type', 'URL', 'Enabled', 'Created']);
			}
		}

		return {
			destinations: destinations.map((d: Destination) => ({
				id: d.id,
				name: d.name,
				description: d.description ?? null,
				destination_type: d.destination_type,
				url: getConfigUrl(d.config) ?? '',
				enabled: d.enabled,
				created_at: d.created_at,
			})),
		};
	},
});

const createDestinationSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a destination for a queue',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud queue destinations create my-queue --type http --name order-webhooks --url https://example.com/webhook'
			),
			description: 'Create an HTTP destination',
		},
		{
			command: getCommand(
				'cloud queue destinations create my-queue --type queue --name retry-queue --queueId que_abc123'
			),
			description: 'Create a queue destination',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		options: z.object({
			name: z.string().min(1).describe('Destination name'),
			description: z.string().optional().describe('Destination description'),
			type: z
				.enum(['http', 'url', 'webhook', 'queue', 'sandbox', 'email'])
				.default('http')
				.describe('Destination type'),
			// HTTP/Webhook options
			url: z.string().url().optional().describe('Webhook URL (for http/url/webhook types)'),
			method: z.string().optional().describe('HTTP method (default: POST)'),
			timeout: z.coerce.number().optional().describe('Request timeout in milliseconds'),
			// Queue options
			queueId: z.string().optional().describe('Target queue ID (for queue type)'),
			// Sandbox options
			sandboxId: z.string().optional().describe('Target sandbox ID (for sandbox type)'),
			// Email options
			email: z.string().email().optional().describe('Target email address (for email type)'),
		}),
		response: DestinationSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		// Build config based on destination type
		let config: Record<string, unknown> = {};
		switch (opts.type) {
			case 'http':
			case 'webhook':
				if (!opts.url) {
					tui.fatal(
						'--url is required for http/webhook destinations',
						ErrorCode.INVALID_ARGUMENT
					);
				}
				config = {
					url: opts.url,
					method: opts.method || 'POST',
					timeout_ms: opts.timeout ?? 30000,
				};
				break;
			case 'url':
				if (!opts.url) {
					tui.fatal('--url is required for url destinations', ErrorCode.INVALID_ARGUMENT);
				}
				config = { url: opts.url };
				break;
			case 'queue':
				if (!opts.queueId) {
					tui.fatal(
						'--queueId is required for queue destinations',
						ErrorCode.INVALID_ARGUMENT
					);
				}
				config = { queue_id: opts.queueId };
				break;
			case 'sandbox':
				if (!opts.sandboxId) {
					tui.fatal(
						'--sandboxId is required for sandbox destinations',
						ErrorCode.INVALID_ARGUMENT
					);
				}
				config = { sandbox_id: opts.sandboxId };
				break;
			case 'email':
				if (!opts.email) {
					tui.fatal('--email is required for email destinations', ErrorCode.INVALID_ARGUMENT);
				}
				config = { email_address: opts.email };
				break;
		}

		try {
			const destination = await createDestination(
				client,
				args.queue_name,
				{
					name: opts.name,
					description: opts.description,
					destination_type: opts.type,
					config,
					enabled: true,
				},
				getQueueApiOptions(ctx)
			);

			if (!options.json) {
				tui.success(`Created destination: ${destination.id}`);
				console.log(`  Name:   ${destination.name}`);
				console.log(`  Type:   ${destination.destination_type}`);
				const url = getConfigUrl(destination.config);
				if (url) console.log(`  URL:    ${url}`);
			}

			return destination;
		} catch (error) {
			if (error instanceof DestinationAlreadyExistsError) {
				tui.fatal(
					`A destination already exists for queue "${args.queue_name}".`,
					ErrorCode.RESOURCE_ALREADY_EXISTS
				);
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
			command: getCommand('cloud queue destinations update my-queue qdest_abc123 --disabled'),
			description: 'Disable a destination',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			destination_id: z.string().min(1).describe('Destination ID'),
		}),
		options: z.object({
			name: z.string().min(1).optional().describe('Destination name'),
			description: z.string().optional().describe('Destination description'),
			url: z.string().url().optional().describe('Webhook URL'),
			method: z.string().optional().describe('HTTP method'),
			timeout: z.coerce.number().optional().describe('Request timeout in milliseconds'),
			enabled: z.boolean().optional().describe('Enable the destination'),
			disabled: z.boolean().optional().describe('Disable the destination'),
		}),
		response: DestinationSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		const updateParams: {
			name?: string;
			description?: string | null;
			config?: { url?: string; method?: string; timeout_ms?: number };
			enabled?: boolean;
		} = {};

		if (opts.name !== undefined) updateParams.name = opts.name;
		if (opts.description !== undefined) updateParams.description = opts.description || null;

		if (opts.url || opts.method || opts.timeout !== undefined) {
			updateParams.config = {};
			if (opts.url) updateParams.config.url = opts.url;
			if (opts.method) updateParams.config.method = opts.method;
			if (opts.timeout !== undefined) updateParams.config.timeout_ms = opts.timeout;
		}
		if (opts.enabled && opts.disabled) {
			tui.fatal(
				'Cannot specify both --enabled and --disabled flags',
				ErrorCode.INVALID_ARGUMENT
			);
		}
		if (opts.enabled) updateParams.enabled = true;
		if (opts.disabled) updateParams.enabled = false;

		const destination = await updateDestination(
			client,
			args.queue_name,
			args.destination_id,
			updateParams,
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Updated destination: ${destination.id}`);
			console.log(`  Name:    ${destination.name}`);
			console.log(`  URL:     ${getConfigUrl(destination.config) ?? 'N/A'}`);
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
	description: 'Manage queue destinations',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue destinations list my-queue'),
			description: 'List destinations',
		},
		{
			command: getCommand(
				'cloud queue destinations create my-queue --type http --name order-webhooks --url https://example.com/webhook'
			),
			description: 'Create an HTTP destination',
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
