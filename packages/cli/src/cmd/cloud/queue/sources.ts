import { z } from 'zod';
import { createCommand, createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createQueueAPIClient, getQueueApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import {
	createSource,
	listSources,
	getSource,
	updateSource,
	deleteSource,
	SourceSchema,
	SourceAlreadyExistsError,
	type Source,
} from '@agentuity/server';
import { ErrorCode } from '../../../errors.ts';

const SourcesListResponseSchema = z.object({
	sources: z.array(
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

const listSourcesSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List sources for a queue',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sources list my-queue'),
			description: 'List queue sources',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		response: SourcesListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const sources = await listSources(client, args.queue_name, getQueueApiOptions(ctx));

		if (!options.json) {
			if (sources.length === 0) {
				tui.info('No sources configured');
			} else {
				const tableData = sources.map((s: Source) => ({
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
			sources: sources.map((s: Source) => ({
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

const createSourceSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a source for a queue',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand(
				'cloud queue sources create my-queue --name webhook-1 --auth-type header --auth-value "X-API-Key:secret123"'
			),
			description: 'Create a source with header authentication',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
		}),
		options: z.object({
			name: z.string().min(1).describe('Source name'),
			description: z.string().optional().describe('Source description'),
			'auth-type': z
				.enum(['none', 'basic', 'header'])
				.default('none')
				.optional()
				.describe('Authentication type'),
			'auth-value': z.string().optional().describe('Authentication value'),
		}),
		response: SourceSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		try {
			const source = await createSource(
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
				tui.success(`Created source: ${source.id}`);
				console.log(`  Name: ${source.name}`);
				console.log(`  URL:  ${source.url}`);
			}

			return source;
		} catch (error) {
			if (error instanceof SourceAlreadyExistsError) {
				tui.fatal(
					`A source with name "${opts.name}" already exists for queue "${args.queue_name}". Use a different name or delete the existing source first.`,
					ErrorCode.RESOURCE_ALREADY_EXISTS
				);
			}
			throw error;
		}
	},
});

const getSourceSubcommand = createSubcommand({
	name: 'get',
	description: 'Get a source by ID',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sources get my-queue qsrc_abc123'),
			description: 'Get source details',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			source_id: z.string().min(1).describe('Source ID'),
		}),
		response: SourceSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		const source = await getSource(
			client,
			args.queue_name,
			args.source_id,
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			console.log(`ID:          ${source.id}`);
			console.log(`Name:        ${source.name}`);
			console.log(`Description: ${source.description || '-'}`);
			console.log(`Auth Type:   ${source.auth_type}`);
			console.log(`Enabled:     ${source.enabled ? 'Yes' : 'No'}`);
			console.log(`URL:         ${source.url}`);
			console.log('');
			console.log('Stats:');
			console.log(`  Requests:  ${source.request_count}`);
			console.log(`  Successes: ${source.success_count}`);
			console.log(`  Failures:  ${source.failure_count}`);
			if (source.last_request_at) {
				console.log(`  Last Request: ${new Date(source.last_request_at).toLocaleString()}`);
			}
			if (source.last_failure_error) {
				console.log(`  Last Error: ${source.last_failure_error}`);
			}
			console.log('');
			console.log(`Created: ${new Date(source.created_at).toLocaleString()}`);
			console.log(`Updated: ${new Date(source.updated_at).toLocaleString()}`);
		}

		return source;
	},
});

const updateSourceSubcommand = createSubcommand({
	name: 'update',
	description: 'Update a source',
	tags: ['mutating', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sources update my-queue qsrc_abc123 --disabled'),
			description: 'Disable a source',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			source_id: z.string().min(1).describe('Source ID'),
		}),
		options: z.object({
			name: z.string().optional().describe('New source name'),
			description: z.string().optional().describe('New description'),
			'auth-type': z
				.enum(['none', 'basic', 'header'])
				.optional()
				.describe('Authentication type'),
			'auth-value': z.string().optional().describe('Authentication value'),
			enabled: z.boolean().optional().describe('Enable the source'),
			disabled: z.boolean().optional().describe('Disable the source'),
		}),
		response: SourceSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = await createQueueAPIClient(ctx);

		const updateParams: {
			name?: string;
			description?: string;
			auth_type?: 'none' | 'basic' | 'header';
			auth_value?: string;
			enabled?: boolean;
		} = {};

		if (opts.name) updateParams.name = opts.name;
		if (opts.description) updateParams.description = opts.description;
		if (opts['auth-type']) updateParams.auth_type = opts['auth-type'];
		if (opts['auth-value']) updateParams.auth_value = opts['auth-value'];
		if (opts.enabled && opts.disabled) {
			tui.fatal(
				'Cannot specify both --enabled and --disabled flags',
				ErrorCode.INVALID_ARGUMENT
			);
		}
		if (opts.enabled) updateParams.enabled = true;
		if (opts.disabled) updateParams.enabled = false;

		const source = await updateSource(
			client,
			args.queue_name,
			args.source_id,
			updateParams,
			getQueueApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Updated source: ${source.id}`);
			console.log(`  Name:    ${source.name}`);
			console.log(`  Enabled: ${source.enabled ? 'Yes' : 'No'}`);
			console.log(`  URL:     ${source.url}`);
		}

		return source;
	},
});

const DeleteSourceResponseSchema = z.object({
	success: z.boolean(),
	queue_name: z.string(),
	source_id: z.string(),
});

const deleteSourceSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm'],
	description: 'Delete a source from a queue',
	tags: ['mutating', 'deletes-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sources delete my-queue qsrc_abc123'),
			description: 'Delete a source',
		},
	],
	schema: {
		args: z.object({
			queue_name: z.string().min(1).describe('Queue name'),
			source_id: z.string().min(1).describe('Source ID'),
		}),
		response: DeleteSourceResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createQueueAPIClient(ctx);
		await deleteSource(client, args.queue_name, args.source_id, getQueueApiOptions(ctx));

		if (!options.json) {
			tui.success(`Deleted source: ${args.source_id}`);
		}

		return {
			success: true,
			queue_name: args.queue_name,
			source_id: args.source_id,
		};
	},
});

export const sourcesSubcommand = createCommand({
	name: 'sources',
	aliases: ['source'],
	description: 'Manage queue sources (HTTP ingestion endpoints)',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud queue sources list my-queue'),
			description: 'List sources',
		},
		{
			command: getCommand(
				'cloud queue sources create my-queue --name webhook-1 --auth-type header --auth-value "X-API-Key:secret"'
			),
			description: 'Create a source with header authentication',
		},
	],
	subcommands: [
		listSourcesSubcommand,
		createSourceSubcommand,
		getSourceSubcommand,
		updateSourceSubcommand,
		deleteSourceSubcommand,
	],
});

export default sourcesSubcommand;
