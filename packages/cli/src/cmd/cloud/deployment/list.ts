import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentList } from '@agentuity/server';
import { resolveProjectId } from './utils';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const DeploymentListResponseSchema = z.array(
	z.object({
		id: z.string().describe('Deployment ID'),
		state: z.string().optional().describe('Current state of the deployment'),
		active: z.boolean().describe('Whether this is the active deployment'),
		createdAt: z.string().describe('Creation timestamp'),
		message: z.string().optional().describe('Deployment message or description'),
		tags: z.array(z.string()).describe('Deployment tags'),
	})
);

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List deployments',
	tags: ['read-only', 'slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud deployment list'),
			description: 'List 10 most recent deployments',
		},
		{
			command: getCommand('cloud deployment list --count=25'),
			description: 'List 25 most recent deployments',
		},
		{
			command: getCommand('cloud deployment list --project-id=proj_abc123xyz'),
			description: 'List deployments for specific project',
		},
	],
	aliases: ['ls'],
	requires: { auth: true, apiClient: true },
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
			'project-id': z.string().optional().describe('Project ID'),
			count: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.default(10)
				.describe('Number of deployments to list (1–100)'),
		}),
		response: DeploymentListResponseSchema,
	},
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts['project-id'] });
		const { apiClient, opts, options } = ctx;

		try {
			const deployments = await projectDeploymentList(apiClient, projectId, opts.count);

			const result = deployments.map((d) => ({
				id: d.id,
				state: d.state,
				active: d.active,
				createdAt: d.createdAt,
				message: d.message ?? undefined,
				tags: d.tags,
			}));

			// Skip TUI output in JSON mode
			if (!options.json) {
				if (deployments.length === 0) {
					tui.info('No deployments found.');
				} else {
					const tableData = deployments.map((d) => ({
						ID: d.id,
						State: d.state || 'unknown',
						Active: d.active ? 'Yes' : '',
						Created: new Date(d.createdAt).toLocaleString(),
						Message: d.message || '',
						Tags: d.tags.join(', '),
					}));

					tui.table(tableData, [
						{ name: 'ID', alignment: 'left' },
						{ name: 'State', alignment: 'left' },
						{ name: 'Active', alignment: 'center' },
						{ name: 'Created', alignment: 'left' },
						{ name: 'Message', alignment: 'left' },
						{ name: 'Tags', alignment: 'left' },
					]);
				}
			}

			return result;
		} catch (ex) {
			tui.fatal(
				`Failed to list deployments: ${ex instanceof Error ? ex.message : String(ex)}`,
				ErrorCode.API_ERROR
			);
		}
	},
});
