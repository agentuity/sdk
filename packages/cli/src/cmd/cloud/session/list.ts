import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { sessionList } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { getCatalystAPIClient } from '../../../config';

const SessionListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Session ID'),
		created_at: z.string().describe('Creation timestamp'),
		success: z.boolean().describe('Whether the session succeeded'),
		duration: z.number().nullable().describe('Duration in nanoseconds'),
		method: z.string().describe('HTTP method'),
		url: z.string().describe('Request URL'),
		trigger: z.string().describe('Trigger type'),
		env: z.string().describe('Environment'),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List recent sessions',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud session list'), description: 'List 10 most recent sessions' },
		{
			command: getCommand('cloud session list --count=25'),
			description: 'List 25 most recent sessions',
		},
		{
			command: getCommand('cloud session list --project-id=proj_*'),
			description: 'Filter by project',
		},
		{
			command: getCommand('cloud session list --deployment-id=*'),
			description: 'Filter by deployment',
		},
		{
			command: getCommand('cloud session list --success=true'),
			description: 'Only successful sessions',
		},
		{
			command: getCommand('cloud session list --devmode=false'),
			description: 'Only production sessions',
		},
		{
			command: getCommand('cloud session list --trigger=api'),
			description: 'Only API triggered sessions',
		},
		{
			command: getCommand('cloud session list --env=production'),
			description: 'Only production environment',
		},
	],
	aliases: ['ls'],
	requires: { auth: true },
	optional: { project: true },
	idempotent: true,
	pagination: {
		supported: true,
		defaultLimit: 10,
		maxLimit: 100,
		parameters: {
			limit: 'count',
		},
	},
	schema: {
		options: z.object({
			count: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.default(10)
				.describe('Number of sessions to list (1–100)'),
			projectId: z.string().optional().describe('Filter by project ID'),
			deploymentId: z.string().optional().describe('Filter by deployment ID'),
			trigger: z.string().optional().describe('Filter by trigger type (api, cron, webhook)'),
			env: z.string().optional().describe('Filter by environment'),
			threadId: z.string().optional().describe('Filter by thread ID'),
			agentIdentifier: z.string().optional().describe('Filter by agent identifier'),
			devmode: z.coerce.boolean().optional().describe('Filter by dev mode (true/false)'),
			success: z.coerce.boolean().optional().describe('Filter by success status (true/false)'),
			startAfter: z.string().optional().describe('Filter by start time after (ISO 8601)'),
			startBefore: z.string().optional().describe('Filter by start time before (ISO 8601)'),
		}),
		response: SessionListResponseSchema,
	},
	async handler(ctx) {
		const { config, logger, auth, project, opts, options } = ctx;
		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const projectId = opts.projectId || project?.projectId;

		try {
			const sessions = await sessionList(catalystClient, {
				count: opts.count,
				projectId,
				deploymentId: opts.deploymentId,
				trigger: opts.trigger,
				env: opts.env,
				devmode: opts.devmode,
				success: opts.success,
				threadId: opts.threadId,
				agentIdentifier: opts.agentIdentifier,
				startAfter: opts.startAfter,
				startBefore: opts.startBefore,
			});

			const result = sessions.map((s) => ({
				id: s.id,
				created_at: s.created_at,
				success: s.success,
				duration: s.duration,
				method: s.method,
				url: s.url,
				trigger: s.trigger,
				env: s.env,
			}));

			if (options.json) {
				console.log(JSON.stringify(result, null, 2));
				return result;
			}

			if (sessions.length === 0) {
				tui.info('No sessions found.');
				return [];
			}

			const tableData = sessions.map((s) => {
				const urlPath = new URL(s.url).pathname;
				return {
					ID: s.id,
					Created: new Date(s.created_at).toLocaleString(),
					Success: s.success ? '✓' : '✗',
					Duration: s.duration ? `${(s.duration / 1_000_000).toFixed(0)}ms` : '-',
					Method: s.method,
					Path: urlPath.length > 50 ? urlPath.substring(0, 47) + '...' : urlPath,
					Trigger: s.trigger,
					Env: s.env,
				};
			});

			tui.table(tableData, [
				{ name: 'ID', alignment: 'left' },
				{ name: 'Created', alignment: 'left' },
				{ name: 'Success', alignment: 'center' },
				{ name: 'Duration', alignment: 'right' },
				{ name: 'Method', alignment: 'left' },
				{ name: 'Path', alignment: 'left' },
				{ name: 'Trigger', alignment: 'left' },
				{ name: 'Env', alignment: 'left' },
			]);

			return result;
		} catch (ex) {
			tui.fatal(`Failed to list sessions: ${ex}`, ErrorCode.API_ERROR);
		}
	},
});
