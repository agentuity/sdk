import type { Logger } from '@agentuity/core';
import { z } from 'zod';
import type { APIClient } from '../../../api.ts';
import { getAPIBaseURL } from '../../../api.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { openInBrowser } from '../../../system/browser.ts';
import * as tui from '../../../tui.ts';
import type { Config } from '../../../types.ts';
import { createSubcommand } from '../../../types.ts';
import {
	getGithubIntegrationStatus,
	pollForGithubIntegration,
	startGithubIntegration,
} from '../api.ts';

export interface RunGitIdentityConnectOptions {
	apiClient: APIClient;
	logger: Logger;
	config?: Config | null;
}

export interface RunGitIdentityConnectResult {
	connected: boolean;
	cancelled?: boolean;
}

export async function runGitIdentityConnect(
	options: RunGitIdentityConnectOptions
): Promise<RunGitIdentityConnectResult> {
	const { apiClient, logger, config } = options;

	try {
		const currentStatus = await getGithubIntegrationStatus(apiClient);
		const initialCount = currentStatus.installations?.length ?? 0;

		if (currentStatus.connected && currentStatus.identity) {
			tui.newline();
			tui.info(
				`Already connected as ${tui.bold(currentStatus.identity.githubUsername)}. Use ${tui.bold('agentuity git account add')} to install the GitHub App on additional accounts.`
			);
			tui.newline();
			return { connected: true };
		}

		const startResult = await tui.spinner({
			message: 'Getting GitHub authorization URL...',
			clearOnSuccess: true,
			callback: () => startGithubIntegration(apiClient),
		});

		if (!startResult) {
			tui.error('Failed to start GitHub authorization');
			return { connected: false };
		}

		const { shortId } = startResult;
		const apiBaseUrl = getAPIBaseURL(config);
		const url = `${apiBaseUrl}/github/connect/${shortId}`;

		const copied = await tui.copyToClipboard(url);

		tui.newline();
		if (copied) {
			tui.output('GitHub authorization URL copied to clipboard! Open it in your browser:');
		} else {
			tui.output('Open this URL in your browser to authorize GitHub access:');
		}
		tui.newline();
		tui.output(`  ${tui.link(url)}`);
		tui.newline();
		tui.output(tui.muted('Press Enter to open in your browser, or Ctrl+C to cancel'));
		tui.newline();

		const result = await tui.spinner({
			type: 'countdown',
			message: 'Waiting for GitHub authorization',
			timeoutMs: 600000,
			clearOnSuccess: true,
			onEnterPress: () => {
				openInBrowser(url);
			},
			callback: async () => {
				return await pollForGithubIntegration(apiClient, initialCount);
			},
		});

		tui.newline();
		if (result.connected) {
			const username = result.identity?.githubUsername;
			if (username) {
				tui.success(`GitHub identity connected as ${tui.bold(username)}`);
			} else {
				tui.success('GitHub identity connected');
			}
			return { connected: true };
		}

		return { connected: false };
	} catch (error) {
		const isCancel =
			error === '' ||
			(error instanceof Error && (error.message === '' || error.message === 'User cancelled'));

		if (isCancel) {
			tui.newline();
			tui.info('Cancelled');
			return { connected: false, cancelled: true };
		}

		logger.trace(error);
		throw error;
	}
}

const ConnectOptionsSchema = z.object({});

const ConnectResponseSchema = z.object({
	connected: z.boolean().describe('Whether the identity was connected'),
});

export const connectSubcommand = createSubcommand({
	name: 'connect',
	description: 'Connect your GitHub identity',
	tags: ['mutating', 'creates-resource', 'slow', 'api-intensive'],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	schema: {
		options: ConnectOptionsSchema,
		response: ConnectResponseSchema,
	},
	examples: [
		{
			command: getCommand('git identity connect'),
			description: 'Connect your GitHub identity',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, config } = ctx;

		try {
			const result = await runGitIdentityConnect({
				apiClient,
				logger,
				config,
			});

			return { connected: result.connected };
		} catch (error) {
			const isCancel =
				error === '' ||
				(error instanceof Error &&
					(error.message === '' || error.message === 'User cancelled'));

			if (isCancel) {
				tui.newline();
				tui.info('Cancelled');
				return { connected: false };
			}

			logger.trace(error);
			return logger.fatal(
				'Failed to connect GitHub identity: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
