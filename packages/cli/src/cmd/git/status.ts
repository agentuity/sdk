import { z } from 'zod';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import * as tui from '../../tui';
import { createSubcommand } from '../../types';
import { getGithubIntegrationStatus, getProjectGithubStatus } from './api';

const StatusResponseSchema = z.object({
	connected: z.boolean().describe('Whether GitHub is connected'),
	identity: z
		.object({
			githubUsername: z.string(),
			githubEmail: z.string().optional(),
		})
		.nullable()
		.describe('Connected GitHub identity'),
	installations: z
		.array(
			z.object({
				installationId: z.string(),
				accountName: z.string(),
				accountType: z.enum(['User', 'Organization']),
			})
		)
		.describe('GitHub App installations'),
	projectId: z.string().describe('Project ID'),
	linked: z.boolean().describe('Whether the project is linked to a repo'),
	repoFullName: z.string().optional().describe('Full repository name'),
	branch: z.string().optional().describe('Branch'),
	directory: z.string().optional().describe('Directory'),
	autoDeploy: z.boolean().optional().describe('Auto-deploy enabled'),
	previewDeploy: z.boolean().optional().describe('Preview deploys enabled'),
});

export const statusSubcommand = createSubcommand({
	name: 'status',
	description: 'Show GitHub connection status for current project',
	tags: ['read-only'],
	idempotent: true,
	requires: { auth: true, apiClient: true, project: true },
	schema: {
		response: StatusResponseSchema,
	},
	examples: [
		{
			command: getCommand('git status'),
			description: 'Show GitHub status for current project',
		},
		{
			command: getCommand('--json git status'),
			description: 'Get status in JSON format',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, project, options } = ctx;

		try {
			// Get user-level GitHub status
			const githubStatus = await tui.spinner({
				message: 'Checking GitHub connection...',
				clearOnSuccess: true,
				callback: () => getGithubIntegrationStatus(apiClient),
			});

			// Get project-level link status
			const projectStatus = await tui.spinner({
				message: 'Checking project status...',
				clearOnSuccess: true,
				callback: () => getProjectGithubStatus(apiClient, project.projectId),
			});

			const result = {
				connected: githubStatus.connected,
				identity: githubStatus.identity
					? {
							githubUsername: githubStatus.identity.githubUsername,
							githubEmail: githubStatus.identity.githubEmail,
						}
					: null,
				installations: githubStatus.installations.map((i) => ({
					installationId: i.installationId,
					accountName: i.accountName,
					accountType: i.accountType,
				})),
				projectId: project.projectId,
				linked: projectStatus.linked,
				repoFullName: projectStatus.repoFullName,
				branch: projectStatus.branch,
				directory: projectStatus.directory,
				autoDeploy: projectStatus.autoDeploy,
				previewDeploy: projectStatus.previewDeploy,
			};

			if (options.json) {
				return result;
			}

			tui.newline();
			console.log(tui.bold('GitHub Status'));
			tui.newline();

			// GitHub identity status
			if (githubStatus.connected && githubStatus.identity) {
				console.log(
					`${tui.bold('GitHub:')} ${tui.colorSuccess('✓')} Connected as ${tui.bold(githubStatus.identity.githubUsername)}`
				);
				if (githubStatus.installations.length > 0) {
					console.log(
						`  ${githubStatus.installations.length} installation${githubStatus.installations.length > 1 ? 's' : ''}`
					);
					for (const installation of githubStatus.installations) {
						const typeLabel = installation.accountType === 'Organization' ? 'org' : 'user';
						console.log(`    - ${installation.accountName} ${tui.muted(`(${typeLabel})`)}`);
					}
				}
			} else {
				console.log(`${tui.bold('GitHub:')} ${tui.colorError('✗')} No GitHub account connected`);
				console.log(tui.muted(`    Run ${tui.bold('agentuity git account add')} to connect one`));
			}

			tui.newline();

			// Project status
			console.log(`${tui.bold('Project:')} ${project.projectId}`);
			if (projectStatus.linked) {
				console.log(
					`  ${tui.colorSuccess('✓')} Linked to ${tui.bold(projectStatus.repoFullName ?? '<unknown repository>')}`
				);
				console.log(`    Branch: ${projectStatus.branch}`);
				if (projectStatus.directory) {
					console.log(`    Directory: ${projectStatus.directory}`);
				}
				console.log(
					`    Auto-deploy: ${projectStatus.autoDeploy ? tui.colorSuccess('enabled') : tui.muted('disabled')}`
				);
				console.log(
					`    Preview deploys: ${projectStatus.previewDeploy ? tui.colorSuccess('enabled') : tui.muted('disabled')}`
				);
			} else {
				console.log(`  ${tui.muted('○')} Not linked to a repository`);
				console.log(tui.muted(`    Run ${tui.bold('agentuity git link')} to link one`));
			}

			tui.newline();

			return result;
		} catch (error) {
			logger.trace(error);
			return logger.fatal('Failed to get GitHub status: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
