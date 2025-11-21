import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentRollback, projectDeploymentList } from '@agentuity/server';
import { resolveProjectId } from './utils';
import { getCommand } from '../../../command-prefix';

const DeploymentRollbackResponseSchema = z.object({
	success: z.boolean().describe('Whether the rollback succeeded'),
	projectId: z.string().describe('Project ID'),
	targetDeploymentId: z.string().describe('Deployment ID that was rolled back to'),
});

export const rollbackSubcommand = createSubcommand({
	name: 'rollback',
	description: 'Rollback the latest to the previous deployment',
	tags: [
		'destructive',
		'deletes-resource',
		'updates-resource',
		'slow',
		'api-intensive',
		'requires-auth',
		'requires-deployment',
	],
	examples: [
		`${getCommand('cloud deployment rollback')}                   # Rollback to previous deployment`,
		`${getCommand('cloud deployment rollback')} --project-id=proj_abc123xyz`,
	],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: {
		options: z.object({
			'project-id': z.string().optional().describe('Project ID'),
		}),
		response: DeploymentRollbackResponseSchema,
	},
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts['project-id'] });
		const { apiClient } = ctx;

		try {
			// Fetch deployments to find the previous one
			const deployments = await projectDeploymentList(apiClient, projectId, 5);

			// Find currently active
			const activeIndex = deployments.findIndex((d) => d.active);

			let targetDeploymentId: string | undefined;

			if (activeIndex === -1) {
				// No active deployment.
				const candidate = deployments.find((d) => d.state === 'completed');
				targetDeploymentId = candidate?.id;
			} else {
				// Has active deployment. Find the next completed one.
				const candidate = deployments
					.slice(activeIndex + 1)
					.find((d) => d.state === 'completed');
				targetDeploymentId = candidate?.id;
			}

			if (!targetDeploymentId) {
				tui.fatal('No previous completed deployment found to rollback to.');
			}

			const confirmed = await tui.confirm(`Rollback to deployment ${targetDeploymentId}?`);
			if (!confirmed) {
				tui.info('Operation cancelled');
				return { success: false, projectId, targetDeploymentId };
			}

			await projectDeploymentRollback(apiClient, projectId, targetDeploymentId!);
			tui.success(`Rolled back to deployment ${targetDeploymentId}.`);

			return {
				success: true,
				projectId,
				targetDeploymentId,
			};
		} catch (ex) {
			tui.fatal(`Failed to rollback: ${ex instanceof Error ? ex.message : String(ex)}`);
		}
	},
});
