import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { projectDeploymentUndeploy } from '@agentuity/server';
import { resolveProjectId } from './utils.ts';
import { getCommand } from '../../../command-prefix.ts';
import { isJSONMode } from '../../../output.ts';

const DeploymentUndeployResponseSchema = z.object({
	success: z.boolean().describe('Whether the undeploy succeeded'),
	projectId: z.string().describe('Project ID'),
	message: z.string().describe('Human-readable operation result'),
});

export const undeploySubcommand = createSubcommand({
	name: 'undeploy',
	description: 'Undeploy the latest deployment',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	examples: [
		{
			command: getCommand('cloud deployment undeploy'),
			description: 'Undeploy with confirmation',
		},
		{
			command: getCommand('cloud deployment undeploy --force'),
			description: 'Undeploy without confirmation',
		},
		{
			command: getCommand('cloud deployment undeploy --project-id=proj_abc123xyz'),
			description: 'Undeploy specific project',
		},
	],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: {
		options: z.object({
			projectId: z.string().optional().describe('filter by project id'),
			force: z.boolean().default(false).describe('Force undeploy without confirmation'),
		}),
		response: DeploymentUndeployResponseSchema,
	},
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts.projectId });
		const { apiClient, opts, options } = ctx;
		const json = isJSONMode(options);

		if (!opts.force) {
			if (json) {
				return {
					success: false,
					projectId,
					message: '--force is required to undeploy in JSON mode.',
				};
			}
			const confirmed = await tui.confirm(
				'Are you sure you want to undeploy? This will stop the active deployment.'
			);
			if (!confirmed) {
				const message = 'Operation cancelled';
				tui.info(message);
				return { success: false, projectId, message };
			}
		}

		try {
			await projectDeploymentUndeploy(apiClient, projectId);
			const message = 'Undeployed successfully.';
			if (!json) {
				tui.success(message);
			}
			return { success: true, projectId, message };
		} catch (ex) {
			tui.fatal(`Failed to undeploy: ${ex}`);
		}
	},
});
