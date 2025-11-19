import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentUndeploy } from '@agentuity/server';
import { resolveProjectId } from './utils';

export const undeploySubcommand = createSubcommand({
	name: 'undeploy',
	description: 'Undeploy the latest deployment',
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	schema: {
		options: z.object({
			'project-id': z.string().optional().describe('Project ID'),
			force: z.boolean().default(false).describe('Force undeploy without confirmation'),
		}),
	},
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts['project-id'] });
		const { apiClient, opts } = ctx;

		if (!opts.force) {
			const confirmed = await tui.confirm(
				'Are you sure you want to undeploy? This will stop the active deployment.'
			);
			if (!confirmed) {
				tui.info('Operation cancelled');
				return;
			}
		}

		try {
			await projectDeploymentUndeploy(apiClient, projectId);
			tui.success('Undeployed successfully.');
		} catch (ex) {
			tui.fatal(`Failed to undeploy: ${ex instanceof Error ? ex.message : String(ex)}`);
		}
	},
});
