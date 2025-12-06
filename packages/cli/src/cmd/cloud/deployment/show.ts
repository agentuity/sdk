import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectDeploymentGet } from '@agentuity/server';
import { resolveProjectId } from './utils';
import { getCommand } from '../../../command-prefix';

const DeploymentShowResponseSchema = z.object({
	id: z.string().describe('Deployment ID'),
	state: z.string().optional().describe('Deployment state'),
	active: z.boolean().describe('Whether deployment is active'),
	createdAt: z.string().describe('Creation timestamp'),
	updatedAt: z.string().optional().describe('Last update timestamp'),
	message: z.string().optional().describe('Deployment message'),
	tags: z.array(z.string()).describe('Deployment tags'),
	customDomains: z.array(z.string()).optional().describe('Custom domains'),
	cloudRegion: z.string().optional().describe('Cloud region'),
	resourceDb: z.string().nullable().optional().describe('the database name'),
	resourceStorage: z.string().nullable().optional().describe('the storage name'),
	deploymentLogsURL: z.string().nullable().optional().describe('the url to the deployment logs'),
	buildLogsURL: z.string().nullable().optional().describe('the url to the build logs'),
	metadata: z
		.object({
			git: z
				.object({
					repo: z.string().optional(),
					commit: z.string().optional(),
					message: z.string().optional(),
					branch: z.string().optional(),
					url: z.string().optional(),
					trigger: z.string().optional(),
					provider: z.string().optional(),
					event: z.string().optional(),
					buildUrl: z.string().optional(),
					pull_request: z
						.object({
							number: z.number(),
							url: z.string().optional(),
							commentId: z.string().optional(),
						})
						.optional(),
				})
				.optional(),
			build: z
				.object({
					agentuity: z.string().optional(),
					bun: z.string().optional(),
					platform: z.string().optional(),
					arch: z.string().optional(),
				})
				.optional(),
		})
		.optional()
		.describe('Deployment metadata'),
});

export const showSubcommand = createSubcommand({
	name: 'show',
	description: 'Show details about a specific deployment',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-deployment'],
	examples: [
		{
			command: `${getCommand('cloud deployment show')} dep_abc123xyz`,
			description: 'Show deployment details by ID',
		},
		{
			command: `${getCommand('cloud deployment show')} deployment-2024-11-20 --project-id=proj_abc123xyz`,
			description: 'Show deployment for specific project',
		},
	],
	aliases: ['get'],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: {
		args: z.object({
			deployment_id: z.string().describe('Deployment ID'),
		}),
		options: z.object({
			'project-id': z.string().optional().describe('Project ID'),
		}),
		response: DeploymentShowResponseSchema,
	},
	idempotent: true,
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts['project-id'] });
		const { apiClient, args, options } = ctx;

		try {
			const deployment = await projectDeploymentGet(apiClient, projectId, args.deployment_id);

			// Skip TUI output in JSON mode
			if (!options.json) {
				const maxWidth = 18;
				console.log(tui.bold('ID:'.padEnd(maxWidth)) + deployment.id);
				console.log(tui.bold('Project:'.padEnd(maxWidth)) + projectId);
				console.log(tui.bold('State:'.padEnd(maxWidth)) + (deployment.state || 'unknown'));
				console.log(tui.bold('Active:'.padEnd(maxWidth)) + (deployment.active ? 'Yes' : 'No'));
				console.log(
					tui.bold('Created:'.padEnd(maxWidth)) +
						new Date(deployment.createdAt).toLocaleString()
				);
				if (deployment.updatedAt) {
					console.log(
						tui.bold('Updated:'.padEnd(maxWidth)) +
							new Date(deployment.updatedAt).toLocaleString()
					);
				}
				if (deployment.message) {
					console.log(tui.bold('Message:'.padEnd(maxWidth)) + deployment.message);
				}
				if (deployment.tags.length > 0) {
					console.log(tui.bold('Tags:'.padEnd(maxWidth)) + deployment.tags.join(', '));
				}
				if (deployment.customDomains && deployment.customDomains.length > 0) {
					console.log(
						tui.bold('Domains:'.padEnd(maxWidth)) + deployment.customDomains.join(', ')
					);
				}
				if (deployment.cloudRegion) {
					console.log(tui.bold('Region:'.padEnd(maxWidth)) + deployment.cloudRegion);
				}
				if (deployment.resourceDb) {
					console.log(tui.bold('Database:'.padEnd(maxWidth)) + deployment.resourceDb);
				}
				if (deployment.resourceStorage) {
					console.log(tui.bold('Storage:'.padEnd(maxWidth)) + deployment.resourceStorage);
				}
				if (deployment.deploymentLogsURL) {
					console.log(
						tui.bold('Deployment Logs:'.padEnd(maxWidth)) +
							tui.link(deployment.deploymentLogsURL)
					);
				}
				if (deployment.buildLogsURL) {
					console.log(
						tui.bold('Build Logs:'.padEnd(maxWidth)) + tui.link(deployment.buildLogsURL)
					);
				}

				// Git metadata
				const git = deployment.metadata?.git;
				if (git) {
					tui.newline();
					tui.info('Git Information');
					if (git.repo) console.log(`  Repo:     ${git.repo}`);
					if (git.branch) console.log(`  Branch:   ${git.branch}`);
					if (git.commit) console.log(`  Commit:   ${git.commit}`);
					if (git.message) console.log(`  Message:  ${git.message}`);
					if (git.url) console.log(`  URL:      ${git.url}`);
					if (git.trigger) console.log(`  Trigger:  ${git.trigger}`);
					if (git.provider) console.log(`  Provider: ${git.provider}`);
					if (git.event) console.log(`  Event:    ${git.event}`);
					if (git.pull_request) {
						console.log(`  PR:       #${git.pull_request.number}`);
						if (git.pull_request.url) console.log(`  PR URL:   ${git.pull_request.url}`);
					}
					if (git.buildUrl) console.log(`  Build:    ${git.buildUrl}`);
				}

				// Build metadata
				const build = deployment.metadata?.build;
				if (build) {
					tui.newline();
					tui.info('Build Information');
					if (build.agentuity) console.log(`  Agentuity: ${build.agentuity}`);
					if (build.bun) console.log(`  Bun:       ${build.bun}`);
					if (build.platform) console.log(`  Platform:  ${build.platform}`);
					if (build.arch) console.log(`  Arch:      ${build.arch}`);
				}
			}

			return {
				id: deployment.id,
				state: deployment.state ?? undefined,
				active: deployment.active,
				createdAt: deployment.createdAt,
				updatedAt: deployment.updatedAt ?? undefined,
				message: deployment.message ?? undefined,
				tags: deployment.tags,
				customDomains: deployment.customDomains ?? undefined,
				cloudRegion: deployment.cloudRegion ?? undefined,
				metadata: deployment.metadata ?? undefined,
				resourceDb: deployment.resourceDb ?? undefined,
				resourceStorage: deployment.resourceStorage ?? undefined,
				deploymentLogsURL: deployment.deploymentLogsURL ?? undefined,
				buildLogsURL: deployment.buildLogsURL ?? undefined,
			};
		} catch (ex) {
			tui.fatal(`Failed to show deployment: ${ex}`);
		}
	},
});
