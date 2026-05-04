import enquirer from 'enquirer';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';
import {
	disconnectGithubIntegration,
	type GithubInstallation,
	getGithubIntegrationStatus,
} from '../api.ts';

const RemoveOptionsSchema = z.object({
	account: z.string().optional().describe('Installation ID to remove'),
	confirm: z.boolean().optional().describe('Skip confirmation prompt'),
});

const RemoveResponseSchema = z.object({
	removed: z.boolean().describe('Whether the installation was removed'),
	installationId: z.string().optional().describe('Installation ID that was removed'),
});

export const removeSubcommand = createSubcommand({
	name: 'remove',
	aliases: ['rm', 'del', 'delete', 'terminate'],
	description: 'Remove a GitHub App installation',
	tags: ['mutating', 'destructive', 'slow'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	schema: {
		options: RemoveOptionsSchema,
		response: RemoveResponseSchema,
	},
	examples: [
		{
			command: getCommand('git account remove'),
			description: 'Remove a GitHub App installation',
		},
		{
			command: getCommand('git account remove --account inst_xyz --confirm'),
			description: 'Remove a specific installation without prompts',
		},
		{
			command: getCommand('--json git account remove --account inst_xyz --confirm'),
			description: 'Remove and return JSON result',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, opts, options } = ctx;

		try {
			// If --account provided directly, skip interactive flow
			if (opts.account) {
				if (!opts.confirm) {
					const confirmed = await tui.confirm(
						'Are you sure you want to remove this GitHub installation?'
					);
					if (!confirmed) {
						tui.info('Cancelled');
						return { removed: false };
					}
				}

				await tui.spinner({
					message: 'Removing GitHub installation...',
					clearOnSuccess: true,
					callback: () => disconnectGithubIntegration(apiClient, opts.account!),
				});

				if (!options.json) {
					tui.newline();
					tui.success('Removed GitHub installation');
				}

				return { removed: true, installationId: opts.account };
			}

			// Interactive flow: get status and show picker
			const status = await tui.spinner({
				message: 'Checking GitHub connection...',
				clearOnSuccess: true,
				callback: () => getGithubIntegrationStatus(apiClient),
			});

			if (!status.connected || !status.identity) {
				if (!options.json) {
					tui.newline();
					tui.info('No GitHub identity connected.');
				}
				return { removed: false };
			}

			if (status.installations.length === 0) {
				if (!options.json) {
					tui.newline();
					tui.info('No installations found.');
				}
				return { removed: false };
			}

			const choices = status.installations.map((inst: GithubInstallation) => ({
				name: inst.installationId,
				message: `${tui.bold(inst.accountName)} ${tui.muted(`(${inst.accountType})`)}`,
			}));

			tui.newline();

			const response = await enquirer.prompt<{ selection: string }>({
				type: 'select',
				name: 'selection',
				message: 'Select an installation to remove',
				choices,
			});

			const selected = status.installations.find(
				(i: GithubInstallation) => i.installationId === response.selection
			);
			const displayName = selected ? tui.bold(selected.accountName) : response.selection;

			if (!opts.confirm) {
				const confirmed = await tui.confirm(`Are you sure you want to remove ${displayName}?`);

				if (!confirmed) {
					tui.newline();
					tui.info('Cancelled');
					return { removed: false };
				}
			}

			await tui.spinner({
				message: 'Removing GitHub installation...',
				clearOnSuccess: true,
				callback: () => disconnectGithubIntegration(apiClient, response.selection),
			});

			if (!options.json) {
				tui.newline();
				tui.success(`Removed ${displayName}`);
			}

			return { removed: true, installationId: response.selection };
		} catch (error) {
			const isCancel =
				error === '' ||
				(error instanceof Error &&
					(error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return { removed: false };
			}

			logger.trace(error);
			return logger.fatal(
				'Failed to remove GitHub installation: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
