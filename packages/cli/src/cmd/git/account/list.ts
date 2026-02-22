import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';
import { getGithubIntegrationStatus } from '../api';

const ListResponseSchema = z.object({
	installations: z.array(
		z.object({
			installationId: z.string().describe('Installation ID'),
			accountName: z.string().describe('GitHub account name'),
			accountType: z.enum(['User', 'Organization']).describe('Account type'),
		})
	),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List GitHub App installations',
	aliases: ['ls'],
	tags: ['read-only'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	schema: {
		response: ListResponseSchema,
	},
	examples: [
		{
			command: getCommand('git account list'),
			description: 'List GitHub App installations',
		},
		{
			command: getCommand('--json git account list'),
			description: 'List installations in JSON format',
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
				installations: status.installations.map((i) => ({
					installationId: i.installationId,
					accountName: i.accountName,
					accountType: i.accountType,
				})),
			};

			if (options.json) {
				return result;
			}

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

			tui.output(tui.bold('GitHub App Installations'));
			tui.newline();

			if (status.installations.length === 0) {
				tui.output(
					tui.muted(
						`No installations found. Run ${tui.bold('agentuity git account add')} to install the GitHub App.`
					)
				);
			} else {
				for (const installation of status.installations) {
					const typeLabel = installation.accountType === 'Organization' ? 'org' : 'user';
					tui.output(
						`  ${tui.colorSuccess('✓')} ${installation.accountName} ${tui.muted(`(${typeLabel})`)}`
					);
				}
			}

			tui.newline();
			tui.output(
				tui.muted(
					`${status.installations.length} installation${status.installations.length !== 1 ? 's' : ''}`
				)
			);

			return result;
		} catch (error) {
			logger.trace(error);
			return logger.fatal(
				'Failed to list GitHub installations: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
