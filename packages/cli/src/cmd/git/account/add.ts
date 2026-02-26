import type { Logger } from '@agentuity/core';
import { z } from 'zod';
import type { APIClient } from '../../../api';
import { getAPIBaseURL } from '../../../api';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import type { Config } from '../../../types';
import { createSubcommand } from '../../../types';
import {
	getGithubIntegrationStatus,
	pollForGithubIntegration,
	startGithubIntegration,
} from '../api';

export interface RunGitAccountAddOptions {
	apiClient: APIClient;
	logger: Logger;
	config?: Config | null;
}

export interface RunGitAccountAddResult {
	added: boolean;
	cancelled?: boolean;
}

export async function runGitAccountAdd(
	options: RunGitAccountAddOptions
): Promise<RunGitAccountAddResult> {
	const { apiClient, logger, config } = options;

	try {
		const currentStatus = await getGithubIntegrationStatus(apiClient);

		if (!currentStatus.connected || !currentStatus.identity) {
			tui.newline();
			tui.error(
				`No GitHub identity connected. Run ${tui.bold('agentuity git identity connect')} first.`
			);
			return { added: false };
		}

		const initialCount = currentStatus.installations?.length ?? 0;

		tui.newline();
		tui.info(
			`Connected as ${tui.bold(currentStatus.identity.githubUsername)}. Opening GitHub to install the app on a new account...`
		);
		tui.newline();

		const startResult = await tui.spinner({
			message: 'Getting GitHub installation URL...',
			clearOnSuccess: true,
			callback: () => startGithubIntegration(apiClient),
		});

		if (!startResult) {
			tui.error('Failed to start GitHub installation flow');
			return { added: false };
		}

		const { shortId } = startResult;
		const apiBaseUrl = getAPIBaseURL(config);
		const url = `${apiBaseUrl}/github/connect/${shortId}`;

		const copied = await tui.copyToClipboard(url);

		tui.newline();
		if (copied) {
			tui.output('GitHub installation URL copied to clipboard! Open it in your browser:');
		} else {
			tui.output('Open this URL in your browser to install the GitHub App:');
		}
		tui.newline();
		tui.output(`  ${tui.link(url)}`);
		tui.newline();
		tui.output(tui.muted('Press Enter to open in your browser, or Ctrl+C to cancel'));
		tui.newline();

		const result = await tui.spinner({
			type: 'countdown',
			message: 'Waiting for GitHub App installation',
			timeoutMs: 600000,
			clearOnSuccess: true,
			onEnterPress: () => {
				const platform = process.platform;
				if (platform === 'win32') {
					Bun.spawn(['cmd', '/c', 'start', '', url], {
						stdout: 'ignore',
						stderr: 'ignore',
					});
				} else {
					const command = platform === 'darwin' ? 'open' : 'xdg-open';
					Bun.spawn([command, url], { stdout: 'ignore', stderr: 'ignore' });
				}
			},
			callback: async () => {
				return await pollForGithubIntegration(apiClient, initialCount);
			},
		});

		tui.newline();
		if (result.connected) {
			tui.success('GitHub App installed on new account');
			return { added: true };
		}

		return { added: false };
	} catch (error) {
		const isCancel =
			error === '' ||
			(error instanceof Error && (error.message === '' || error.message === 'User cancelled'));

		if (isCancel) {
			tui.newline();
			tui.info('Cancelled');
			return { added: false, cancelled: true };
		}

		logger.trace(error);
		throw error;
	}
}

const AddOptionsSchema = z.object({});

const AddResponseSchema = z.object({
	added: z.boolean().describe('Whether the installation was added'),
});

export const addSubcommand = createSubcommand({
	name: 'add',
	description: 'Install the GitHub App on a new account or organization',
	tags: ['mutating', 'creates-resource', 'slow', 'api-intensive'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	schema: {
		options: AddOptionsSchema,
		response: AddResponseSchema,
	},
	examples: [
		{
			command: getCommand('git account add'),
			description: 'Install the GitHub App on a new account',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, config } = ctx;

		try {
			const result = await runGitAccountAdd({
				apiClient,
				logger,
				config,
			});

			return { added: result.added };
		} catch (error) {
			const isCancel =
				error === '' ||
				(error instanceof Error &&
					(error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return { added: false };
			}

			logger.trace(error);
			return logger.fatal(
				'Failed to add GitHub account: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
