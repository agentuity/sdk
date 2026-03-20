import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentDelete } from '@agentuity/server';
import { resolveProjectId } from './utils';
import { getCommand } from '../../../command-prefix';
const DeploymentDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the deletion succeeded'),
	projectId: z.string().describe('Project ID'),
	deploymentId: z.string().describe('Deployment ID that was deleted'),
});

export const removeSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove', 'terminate'],
	description: 'Delete a specific deployment',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	examples: [
		{
			command: getCommand('cloud deployment delete deploy_abc123xyz'),
			description: 'Delete with confirmation',
		},
		{
			command: getCommand('cloud deployment delete deploy_abc123xyz --force'),
			description: 'Delete without confirmation',
		},
		{
			command: getCommand(
				'cloud deployment delete deploy_2024-11-20 --project-id=proj_abc123xyz'
			),
			description: 'Delete deployment from specific project',
		},
	],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: {
		args: z.object({
			deployment_id: z.string().describe('Deployment ID'),
		}),
		options: z.object({
			projectId: z.string().optional().describe('filter by project id'),
			force: z.boolean().default(false).describe('Force deletion without confirmation'),
		}),
		response: DeploymentDeleteResponseSchema,
	},
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts.projectId });
		const { apiClient, args, opts } = ctx;

		if (!opts.force) {
			const confirmed = await tui.confirm(
				`Are you sure you want to delete deployment ${args.deployment_id}?`
			);
			if (!confirmed) {
				tui.info('Operation cancelled');
				return { success: false, projectId, deploymentId: args.deployment_id };
			}
		}

		try {
			await projectDeploymentDelete(apiClient, projectId, args.deployment_id);
			tui.success(`Deployment ${args.deployment_id} deleted successfully.`);

			return {
				success: true,
				projectId,
				deploymentId: args.deployment_id,
			};
		} catch (ex) {
			tui.fatal(`Failed to delete deployment: ${ex}`);
		}
	},
});
