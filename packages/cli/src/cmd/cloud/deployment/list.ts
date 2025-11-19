import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentList } from '@agentuity/server';
import { resolveProjectId } from './utils';
import { Table } from 'console-table-printer';

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List deployments',
	aliases: ['ls'],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
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
	},
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts['project-id'] });
		const { apiClient, opts } = ctx;

		try {
			const deployments = await projectDeploymentList(apiClient, projectId, opts.count);

			if (deployments.length === 0) {
				tui.info('No deployments found.');
				return;
			}

			const table = new Table({
				columns: [
					{ name: 'ID', alignment: 'left' },
					{ name: 'State', alignment: 'left' },
					{ name: 'Active', alignment: 'center' },
					{ name: 'Created', alignment: 'left' },
					{ name: 'Message', alignment: 'left' },
					{ name: 'Tags', alignment: 'left' },
				],
			});

			for (const d of deployments) {
				table.addRow({
					ID: d.id,
					State: d.state || 'unknown',
					Active: d.active ? 'Yes' : '',
					Created: new Date(d.createdAt).toLocaleString(),
					Message: d.message || '',
					Tags: d.tags.join(', '),
				});
			}
			table.printTable();
		} catch (ex) {
			tui.fatal(`Failed to list deployments: ${ex instanceof Error ? ex.message : String(ex)}`);
		}
	},
});
