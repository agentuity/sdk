import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';
import { disconnectGithubIntegration, getGithubIntegrationStatus } from '../api';

const DisconnectOptionsSchema = z.object({
	confirm: z.boolean().optional().describe('Skip confirmation prompt'),
});

const DisconnectResponseSchema = z.object({
	disconnected: z.boolean().describe('Whether the identity was disconnected'),
});

export const disconnectSubcommand = createSubcommand({
	name: 'disconnect',
	description: 'Disconnect your GitHub identity and all installations',
	tags: ['mutating', 'destructive', 'slow'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	schema: {
		options: DisconnectOptionsSchema,
		response: DisconnectResponseSchema,
	},
	examples: [
		{
			command: getCommand('git identity disconnect'),
			description: 'Disconnect your GitHub identity',
		},
		{
			command: getCommand('git identity disconnect --confirm'),
			description: 'Disconnect without confirmation prompt',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, opts, options } = ctx;

		try {
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
				return { disconnected: false };
			}

			if (!opts.confirm) {
				tui.newline();
				tui.output(
					`Connected as ${tui.bold(status.identity.githubUsername)} with ${status.installations.length} installation${status.installations.length !== 1 ? 's' : ''}.`
				);
				tui.newline();

				const confirmed = await tui.confirm(
					'Are you sure you want to disconnect your GitHub identity?'
				);
				if (!confirmed) {
					tui.info('Cancelled');
					return { disconnected: false };
				}
			}

			await tui.spinner({
				message: 'Disconnecting GitHub identity...',
				clearOnSuccess: true,
				callback: () => disconnectGithubIntegration(apiClient),
			});

			if (!options.json) {
				tui.newline();
				tui.success('Disconnected GitHub identity and all installations');
			}

			return { disconnected: true };
		} catch (error) {
			const isCancel =
				error === '' ||
				(error instanceof Error && (error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return { disconnected: false };
			}

			logger.trace(error);
			return logger.fatal(
				'Failed to disconnect GitHub identity: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
