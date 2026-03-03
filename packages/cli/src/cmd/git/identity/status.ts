import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';
import { getGithubIntegrationStatus } from '../api';

const StatusResponseSchema = z.object({
	connected: z.boolean().describe('Whether a GitHub identity is connected'),
	identity: z
		.object({
			githubUsername: z.string().describe('GitHub username'),
			githubEmail: z.string().optional().describe('GitHub email'),
		})
		.nullable()
		.describe('Connected GitHub identity'),
});

export const statusSubcommand = createSubcommand({
	name: 'status',
	description: 'Show your connected GitHub identity',
	tags: ['read-only'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	schema: {
		response: StatusResponseSchema,
	},
	examples: [
		{
			command: getCommand('git identity status'),
			description: 'Show your connected GitHub identity',
		},
		{
			command: getCommand('--json git identity status'),
			description: 'Show identity in JSON format',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, options } = ctx;

		try {
			const status = await tui.spinner({
				message: 'Checking GitHub connection...',
				clearOnSuccess: true,
				callback: () => getGithubIntegrationStatus(apiClient),
			});

			const result = {
				connected: status.connected,
				identity: status.identity
					? {
							githubUsername: status.identity.githubUsername,
							githubEmail: status.identity.githubEmail,
						}
					: null,
			};

			if (options.json) {
				return result;
			}

			tui.newline();
			tui.output(tui.bold('GitHub Identity'));
			tui.newline();

			if (!status.connected || !status.identity) {
				tui.output(
					tui.muted(
						`No GitHub identity connected. Run ${tui.bold('agentuity git identity connect')} to connect one.`
					)
				);
				tui.newline();
				return result;
			}

			tui.output(
				`  ${tui.colorSuccess('✓')} Connected as ${tui.bold(status.identity.githubUsername)}`
			);
			if (status.identity.githubEmail) {
				tui.output(`    Email: ${status.identity.githubEmail}`);
			}

			tui.newline();

			return result;
		} catch (error) {
			logger.trace(error);
			return logger.fatal(
				'Failed to check GitHub identity: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
