import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { createQueueAPIClient, getQueueApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import {
	createSink,
	listSinks,
	getSink,
	updateSink,
	deleteSink,
	SinkSchema,
	SinkAlreadyExistsError,
	type Sink,
} from '@agentuity/server';

const SinksListResponseSchema = z.object({
	sinks: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			auth_type: z.string(),
			enabled: z.boolean(),
			url: z.string(),
			created_at: z.string(),
		})
	),
});

const listSinksSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List sinks for a queue',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sinks list my-queue'),
			description: 'List queue sinks',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		response: SinksListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const sinks = await listSinks(client, args.queue_name, getQueueApiOptions(ctx));

		if (!options.json) {
			if (sinks.length === 0) {
				tui.info('No sinks configured');
			} else {
				const tableData = sinks.map((s: Sink) => ({
					ID: s.id,
					Name: s.name,
					'Auth Type': s.auth_type,
					Enabled: s.enabled ? 'Yes' : 'No',
					URL: s.url,
					Created: new Date(s.created_at).toLocaleString(),
				}));
				tui.table(tableData, ['ID', 'Name', 'Auth Type', 'Enabled', 'URL', 'Created']);
			}
		}

		return {
			sinks: sinks.map((s: Sink) => ({
				id: s.id,
				name: s.name,
				auth_type: s.auth_type,
				enabled: s.enabled,
				url: s.url,
				created_at: s.created_at,
			})),
		};
	},
});

const createSinkSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a sink for a queue',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud queue sinks create my-queue --name webhook-1 --auth-type header --auth-value "X-API-Key:secret123"'
			),
			description: 'Create a sink with header authentication',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		options: z.object({
			name: z.string().min(1).describe('Sink name'),
			description: z.string().optional().describe('Sink description'),
			'auth-type': z
				.enum(['none', 'basic', 'digest', 'header'])
				.default('none')
				.optional()
				.describe('Authentication type'),
			'auth-value': z.string().optional().describe('Authentication value'),
		}),
		response: SinkSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		try {
			const sink = await createSink(
				client,
				args.queue_name,
				{
					name: opts.name,
					description: opts.description,
					auth_type: opts['auth-type'] || 'none',
					auth_value: opts['auth-value'],
				},
				getQueueApiOptions(ctx)
			);

			if (!options.json) {
				tui.success(`Created sink: ${sink.id}`);
				console.log(`  Name: ${sink.name}`);
				console.log(`  URL:  ${sink.url}`);
			}

			return sink;
		} catch (error) {
			if (error instanceof SinkAlreadyExistsError) {
				tui.error(
					`A sink with name "${opts.name}" already exists for queue "${args.queue_name}"`
				);
				tui.info('Hint: Use a different name or delete the existing sink first');
				process.exit(1);
			}
			throw error;
		}
	},
});

const getSinkSubcommand = createSubcommand({
	name: 'get',
	description: 'Get a sink by ID',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sinks get my-queue qsnk_abc123'),
			description: 'Get sink details',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			sink_id: z.string().min(1).describe('Sink ID'),
		}),
		response: SinkSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const sink = await getSink(client, args.queue_name, args.sink_id, getQueueApiOptions(ctx));

		if (!options.json) {
			console.log(`ID:          ${sink.id}`);
			console.log(`Name:        ${sink.name}`);
			console.log(`Description: ${sink.description || '-'}`);
			console.log(`Auth Type:   ${sink.auth_type}`);
			console.log(`Enabled:     ${sink.enabled ? 'Yes' : 'No'}`);
			console.log(`URL:         ${sink.url}`);
			console.log('');
			console.log('Stats:');
			console.log(`  Requests:  ${sink.request_count}`);
			console.log(`  Successes: ${sink.success_count}`);
			console.log(`  Failures:  ${sink.failure_count}`);
			if (sink.last_request_at) {
				console.log(`  Last Request: ${new Date(sink.last_request_at).toLocaleString()}`);
			}
			if (sink.last_failure_error) {
				console.log(`  Last Error: ${sink.last_failure_error}`);
			}
			console.log('');
			console.log(`Created: ${new Date(sink.created_at).toLocaleString()}`);
			console.log(`Updated: ${new Date(sink.updated_at).toLocaleString()}`);
		}

		return sink;
	},
});

const updateSinkSubcommand = createSubcommand({
	name: 'update',
	description: 'Update a sink',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sinks update my-queue qsnk_abc123 --disabled'),
			description: 'Disable a sink',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			sink_id: z.string().min(1).describe('Sink ID'),
		}),
		options: z.object({
			name: z.string().optional().describe('New sink name'),
			description: z.string().optional().describe('New description'),
			'auth-type': z
				.enum(['none', 'basic', 'digest', 'header'])
				.optional()
				.describe('Authentication type'),
			'auth-value': z.string().optional().describe('Authentication value'),
			enabled: z.boolean().optional().describe('Enable the sink'),
			disabled: z.boolean().optional().describe('Disable the sink'),
		}),
		response: SinkSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		const updateParams: {
			name?: string;
			description?: string;
			auth_type?: 'none' | 'basic' | 'digest' | 'header';
			auth_value?: string;
			enabled?: boolean;
		} = {};

		if (opts.name) updateParams.name = opts.name;
		if (opts.description) updateParams.description = opts.description;
		if (opts['auth-type']) updateParams.auth_type = opts['auth-type'];
		if (opts['auth-value']) updateParams.auth_value = opts['auth-value'];
		if (opts.enabled) updateParams.enabled = true;
		if (opts.disabled) updateParams.enabled = false;

		const sink = await updateSink(
			client,
			args.queue_name,
			args.sink_id,
			updateParams,
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Updated sink: ${sink.id}`);
			console.log(`  Name:    ${sink.name}`);
			console.log(`  Enabled: ${sink.enabled ? 'Yes' : 'No'}`);
			console.log(`  URL:     ${sink.url}`);
		}

		return sink;
	},
});

const DeleteSinkResponseSchema = z.object({
	success: z.boolean(),
	queue_name: z.string(),
	sink_id: z.string(),
});

const deleteSinkSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm'],
	description: 'Delete a sink from a queue',
	tags: ['mutating', 'deletes-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sinks delete my-queue qsnk_abc123'),
			description: 'Delete a sink',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			sink_id: z.string().min(1).describe('Sink ID'),
		}),
		response: DeleteSinkResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		await deleteSink(client, args.queue_name, args.sink_id, getQueueApiOptions(ctx));

		if (!options.json) {
			tui.success(`Deleted sink: ${args.sink_id}`);
		}

		return {
			success: true,
			queue_name: args.queue_name,
			sink_id: args.sink_id,
		};
	},
});

export const sinksSubcommand = createCommand({
	name: 'sinks',
	aliases: ['sink'],
	description: 'Manage queue sinks (HTTP ingestion endpoints)',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sinks list my-queue'),
			description: 'List sinks',
		},
		{
			command: getCommand(
				'cloud queue sinks create my-queue --name webhook-1 --auth-type header --auth-value "X-API-Key:secret"'
			),
			description: 'Create a sink with header authentication',
		},
	],
	subcommands: [
		listSinksSubcommand,
		createSinkSubcommand,
		getSinkSubcommand,
		updateSinkSubcommand,
		deleteSinkSubcommand,
	],
});

export default sinksSubcommand;
