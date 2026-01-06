import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { getProjectGithubStatus, unlinkProjectFromRepo } from '../integration/api';
import { z } from 'zod';

const UnlinkOptionsSchema = z.object({
	confirm: z.boolean().optional().describe('Skip confirmation prompt'),
});

const UnlinkResponseSchema = z.object({
	unlinked: z.boolean().describe('Whether the project was unlinked'),
	repoFullName: z.string().optional().describe('Repository that was unlinked'),
});

export const unlinkSubcommand = createSubcommand({
	name: 'unlink',
	description: 'Unlink a project from its GitHub repository',
	tags: ['mutating', 'destructive'],
	idempotent: false,
	requires: { auth: true, apiClient: true, project: true },
	schema: {
		options: UnlinkOptionsSchema,
		response: UnlinkResponseSchema,
	},
	examples: [
		{
			command: getCommand('git unlink'),
			description: 'Unlink current project from GitHub',
		},
		{
			command: getCommand('git unlink --confirm'),
			description: 'Unlink without confirmation prompt',
		},
		{
			command: getCommand('--json git unlink --confirm'),
			description: 'Unlink and return JSON result',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, project, opts, options } = ctx;

		try {
			// Check current status
			const status = await tui.spinner({
				message: 'Checking current status...',
				clearOnSuccess: true,
				callback: () => getProjectGithubStatus(apiClient, project.projectId),
			});

			if (!status.linked) {
				if (!options.json) {
					tui.newline();
					tui.info('This project is not linked to a GitHub repository.');
				}
				return { unlinked: false };
			}

			if (!opts.confirm) {
				tui.newline();
				console.log(`Currently linked to: ${tui.bold(status.repoFullName ?? 'Unknown')}`);
				console.log(`  Branch: ${status.branch ?? 'default'}`);
				if (status.directory) {
					console.log(`  Directory: ${status.directory}`);
				}
				console.log(`  Auto-deploy: ${status.autoDeploy ? 'enabled' : 'disabled'}`);
				console.log(`  Preview deploys: ${status.previewDeploy ? 'enabled' : 'disabled'}`);
				tui.newline();

				const confirmed = await tui.confirm(
					`Are you sure you want to unlink from ${tui.bold(status.repoFullName ?? 'this repository')}?`
				);

				if (!confirmed) {
					tui.info('Cancelled');
					return { unlinked: false };
				}
			}

			await tui.spinner({
				message: 'Unlinking repository...',
				clearOnSuccess: true,
				callback: () => unlinkProjectFromRepo(apiClient, project.projectId),
			});

			if (!options.json) {
				tui.newline();
				tui.success(`Unlinked from ${tui.bold(status.repoFullName ?? 'repository')}`);
				tui.newline();
				console.log('Automatic deployments have been disabled for this project.');
			}

			return { unlinked: true, repoFullName: status.repoFullName };
		} catch (error) {
			// Handle user cancellation
			const isCancel =
				error === '' ||
				(error instanceof Error &&
					(error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return { unlinked: false };
			}

			logger.trace(error);
			return logger.fatal(
				'Failed to unlink repository: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
