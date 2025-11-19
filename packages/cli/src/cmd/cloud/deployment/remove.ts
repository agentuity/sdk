import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentDelete } from '@agentuity/server';
import { resolveProjectId } from './utils';

export const removeSubcommand = createSubcommand({
	name: 'remove',
	description: 'Remove a specific deployment',
	aliases: ['rm', 'delete'],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	schema: {
		args: z.object({
			deployment_id: z.string().describe('Deployment ID'),
		}),
		options: z.object({
			'project-id': z.string().optional().describe('Project ID'),
			force: z.boolean().default(false).describe('Force removal without confirmation'),
		}),
	},
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts['project-id'] });
		const { apiClient, args, opts } = ctx;

		if (!opts.force) {
			const confirmed = await tui.confirm(
				`Are you sure you want to remove deployment ${args.deployment_id}?`
			);
			if (!confirmed) {
				tui.info('Operation cancelled');
				return;
			}
		}

		try {
			await projectDeploymentDelete(apiClient, projectId, args.deployment_id);
			tui.success(`Deployment ${args.deployment_id} removed successfully.`);
		} catch (ex) {
			tui.fatal(`Failed to remove deployment: ${ex instanceof Error ? ex.message : String(ex)}`);
		}
	},
});
