import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { getProjectGithubStatus, getGithubIntegrationStatus } from '../integration/api';
import { z } from 'zod';

const StatusResponseSchema = z.object({
	orgId: z.string().describe('Organization ID'),
	connected: z.boolean().describe('Whether GitHub is connected to the org'),
	integrations: z
		.array(
			z.object({
				id: z.string(),
				githubAccountName: z.string(),
				githubAccountType: z.enum(['user', 'org']),
			})
		)
		.describe('Connected GitHub accounts'),
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
			// Get org-level GitHub status
			const orgStatus = await tui.spinner({
				message: 'Checking GitHub connection...',
				clearOnSuccess: true,
				callback: () => getGithubIntegrationStatus(apiClient, project.orgId),
			});

			// Get project-level link status
			const projectStatus = await tui.spinner({
				message: 'Checking project status...',
				clearOnSuccess: true,
				callback: () => getProjectGithubStatus(apiClient, project.projectId),
			});

			const result = {
				orgId: project.orgId,
				connected: orgStatus.connected,
				integrations: orgStatus.integrations.map((i) => ({
					id: i.id,
					githubAccountName: i.githubAccountName,
					githubAccountType: i.githubAccountType,
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

			// Organization status
			console.log(`${tui.bold('Organization:')} ${project.orgId}`);
			if (orgStatus.connected && orgStatus.integrations.length > 0) {
				console.log(
					`  ${tui.colorSuccess('✓')} ${orgStatus.integrations.length} GitHub account${orgStatus.integrations.length > 1 ? 's' : ''} connected`
				);
				for (const integration of orgStatus.integrations) {
					const typeLabel = integration.githubAccountType === 'org' ? 'org' : 'user';
					console.log(`    - ${integration.githubAccountName} ${tui.muted(`(${typeLabel})`)}`);
				}
			} else {
				console.log(`  ${tui.colorError('✗')} No GitHub accounts connected`);
				console.log(
					tui.muted(`    Run ${tui.bold('agentuity git account add')} to connect one`)
				);
			}

			tui.newline();

			// Project status
			console.log(`${tui.bold('Project:')} ${project.projectId}`);
			if (projectStatus.linked) {
				console.log(
					`  ${tui.colorSuccess('✓')} Linked to ${tui.bold(projectStatus.repoFullName!)}`
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
			return logger.fatal(
				'Failed to get GitHub status: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
