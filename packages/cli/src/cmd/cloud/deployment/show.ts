import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentGet } from '@agentuity/server';
import { resolveProjectId } from './utils';

export const showSubcommand = createSubcommand({
	name: 'show',
	description: 'Show details about a specific deployment',
	aliases: ['get'],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	schema: {
		args: z.object({
			deployment_id: z.string().describe('Deployment ID'),
		}),
		options: z.object({
			'project-id': z.string().optional().describe('Project ID'),
		}),
	},
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts['project-id'] });
		const { apiClient, args } = ctx;

		try {
			const deployment = await projectDeploymentGet(apiClient, projectId, args.deployment_id);

			tui.banner(`Deployment ${deployment.id}`, `State: ${deployment.state || 'unknown'}`);

			console.log(tui.bold('ID:       ') + deployment.id);
			console.log(tui.bold('Project:  ') + projectId);
			console.log(tui.bold('State:    ') + (deployment.state || 'unknown'));
			console.log(tui.bold('Active:   ') + (deployment.active ? 'Yes' : 'No'));
			console.log(tui.bold('Created:  ') + new Date(deployment.createdAt).toLocaleString());
			if (deployment.updatedAt) {
				console.log(tui.bold('Updated:  ') + new Date(deployment.updatedAt).toLocaleString());
			}
			if (deployment.message) {
				console.log(tui.bold('Message:  ') + deployment.message);
			}
			if (deployment.tags.length > 0) {
				console.log(tui.bold('Tags:     ') + deployment.tags.join(', '));
			}
			if (deployment.customDomains && deployment.customDomains.length > 0) {
				console.log(tui.bold('Domains:  ') + deployment.customDomains.join(', '));
			}
			if (deployment.cloudRegion) {
				console.log(tui.bold('Region:   ') + deployment.cloudRegion);
			}

			// Metadata
			const origin = deployment.metadata?.origin;
			if (origin?.commit) {
				tui.newline();
				tui.info('Origin Information');
				if (origin.trigger) console.log(`  Trigger:  ${origin.trigger}`);
				if (origin.provider) console.log(`  Provider: ${origin.provider}`);
				if (origin.event) console.log(`  Event:    ${origin.event}`);
				if (origin.branch) console.log(`  Branch:   ${origin.branch}`);

				if (origin.commit) {
					console.log(`  Commit:   ${origin.commit.hash}`);
					if (origin.commit.message) console.log(`  Message:  ${origin.commit.message}`);
					if (origin.commit.author?.name)
						console.log(`  Author:   ${origin.commit.author.name}`);
				}
			}
		} catch (ex) {
			tui.fatal(`Failed to show deployment: ${ex instanceof Error ? ex.message : String(ex)}`);
		}
	},
});
