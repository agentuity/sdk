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
	dnsRecords: z.array(z.string()).optional().describe('DNS records for custom domains'),
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
			projectId: z.string().optional().describe('filter by project id'),
		}),
		response: DeploymentShowResponseSchema,
	},
	idempotent: true,
	async handler(ctx) {
		const projectId = resolveProjectId(ctx, { projectId: ctx.opts.projectId });
		const { apiClient, args, options } = ctx;

		try {
			const deployment = await projectDeploymentGet(apiClient, projectId, args.deployment_id);

			// Skip TUI output in JSON mode
			if (!options.json) {
				const tableData: Record<string, string> = {
					ID: deployment.id,
					Project: projectId,
					State: deployment.state || 'unknown',
					Active: deployment.active ? 'Yes' : 'No',
					Created: new Date(deployment.createdAt).toLocaleString(),
				};
				if (deployment.updatedAt) {
					tableData['Updated'] = new Date(deployment.updatedAt).toLocaleString();
				}
				if (deployment.message) {
					tableData['Message'] = deployment.message;
				}
				if (deployment.tags.length > 0) {
					tableData['Tags'] = deployment.tags.join(', ');
				}
				if (deployment.customDomains && deployment.customDomains.length > 0) {
					tableData['Domains'] = deployment.customDomains.join(', ');
				}
				if (deployment.cloudRegion) {
					tableData['Region'] = deployment.cloudRegion;
				}
				if (deployment.resourceDb) {
					tableData['Database'] = deployment.resourceDb;
				}
				if (deployment.resourceStorage) {
					tableData['Storage'] = deployment.resourceStorage;
				}
				if (deployment.deploymentLogsURL) {
					tableData['Deployment Logs'] = tui.link(deployment.deploymentLogsURL);
				}
				if (deployment.buildLogsURL) {
					tableData['Build Logs'] = tui.link(deployment.buildLogsURL);
				}
				if (deployment.dnsRecords && deployment.dnsRecords.length > 0) {
					tableData['DNS Records'] = deployment.dnsRecords.join(', ');
				}

				tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });

				// Git metadata
				const git = deployment.metadata?.git;
				if (git) {
					const gitData: Record<string, string> = {};
					if (git.repo) gitData['Repo'] = git.repo;
					if (git.branch) gitData['Branch'] = git.branch;
					if (git.commit) gitData['Commit'] = git.commit;
					if (git.message) gitData['Message'] = git.message;
					if (git.url) gitData['URL'] = git.url;
					if (git.trigger) gitData['Trigger'] = git.trigger;
					if (git.provider) gitData['Provider'] = git.provider;
					if (git.event) gitData['Event'] = git.event;
					if (git.pull_request) {
						gitData['PR'] = `#${git.pull_request.number}`;
						if (git.pull_request.url) gitData['PR URL'] = git.pull_request.url;
					}
					if (git.buildUrl) gitData['Build'] = git.buildUrl;

					if (Object.keys(gitData).length > 0) {
						tui.newline();
						tui.info('Git Information');
						tui.table([gitData], Object.keys(gitData), {
							layout: 'vertical',
							padStart: '  ',
						});
					}
				}

				// Build metadata
				const build = deployment.metadata?.build;
				if (build) {
					const buildData: Record<string, string> = {};
					if (build.agentuity) buildData['Agentuity'] = build.agentuity;
					if (build.bun) buildData['Bun'] = build.bun;
					if (build.platform) buildData['Platform'] = build.platform;
					if (build.arch) buildData['Arch'] = build.arch;

					if (Object.keys(buildData).length > 0) {
						tui.newline();
						tui.info('Build Information');
						tui.table([buildData], Object.keys(buildData), {
							layout: 'vertical',
							padStart: '  ',
						});
					}
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
				dnsRecords: deployment.dnsRecords ?? undefined,
			};
		} catch (ex) {
			tui.fatal(`Failed to show deployment: ${ex}`);
		}
	},
});
