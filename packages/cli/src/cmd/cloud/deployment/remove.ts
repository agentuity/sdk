import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentDelete } from '@agentuity/server';
import { resolveProjectId } from './utils';
import { getCommand } from '../../../command-prefix';

const DeploymentRemoveResponseSchema = z.object({
	success: z.boolean().describe('Whether the removal succeeded'),
	projectId: z.string().describe('Project ID'),
	deploymentId: z.string().describe('Deployment ID that was removed'),
});

export const removeSubcommand = createSubcommand({
	name: 'remove',
	description: 'Remove a specific deployment',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	examples: [
		`${getCommand('cloud deployment remove')} dep_abc123xyz        # Remove with confirmation`,
		`${getCommand('cloud deployment remove')} dep_abc123xyz --force # Remove without confirmation`,
		`${getCommand('cloud deployment remove')} deployment-2024-11-20 --project-id=proj_abc123xyz`,
	],
	aliases: ['rm', 'delete'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: {
		args: z.object({
			deployment_id: z.string().describe('Deployment ID'),
		}),
		options: z.object({
			'project-id': z.string().optional().describe('Project ID'),
			force: z.boolean().default(false).describe('Force removal without confirmation'),
		}),
		response: DeploymentRemoveResponseSchema,
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
				return { success: false, projectId, deploymentId: args.deployment_id };
			}
		}

		try {
			await projectDeploymentDelete(apiClient, projectId, args.deployment_id);
			tui.success(`Deployment ${args.deployment_id} removed successfully.`);

			return {
				success: true,
				projectId,
				deploymentId: args.deployment_id,
			};
		} catch (ex) {
			tui.fatal(`Failed to remove deployment: ${ex instanceof Error ? ex.message : String(ex)}`);
		}
	},
});
