import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { getProjectGithubStatus, unlinkProjectFromRepo } from '../integration/api';

export const unlinkSubcommand = createSubcommand({
	name: 'unlink',
	description: 'Unlink a project from its GitHub repository',
	tags: ['mutating', 'destructive'],
	idempotent: false,
	requires: { auth: true, apiClient: true, project: true },
	examples: [
		{
			command: getCommand('git unlink'),
			description: 'Unlink current project from GitHub',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, project } = ctx;

		try {
			// Check current status
			const status = await tui.spinner({
				message: 'Checking current status...',
				clearOnSuccess: true,
				callback: () => getProjectGithubStatus(apiClient, project.projectId),
			});

			if (!status.linked) {
				tui.newline();
				tui.info('This project is not linked to a GitHub repository.');
				return;
			}

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
				return;
			}

			await tui.spinner({
				message: 'Unlinking repository...',
				clearOnSuccess: true,
				callback: () => unlinkProjectFromRepo(apiClient, project.projectId),
			});

			tui.newline();
			tui.success(`Unlinked from ${tui.bold(status.repoFullName ?? 'repository')}`);
			tui.newline();
			console.log('Automatic deployments have been disabled for this project.');
		} catch (error) {
			// Handle user cancellation
			const isCancel =
				error === '' ||
				(error instanceof Error &&
					(error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return;
			}

			logger.trace(error);
			logger.fatal('Failed to unlink repository: %s', error, ErrorCode.INTEGRATION_FAILED);
		}
	},
});
