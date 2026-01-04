import { createSubcommand } from '../../../types';
import type { Config } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { getAPIBaseURL } from '../../../api';
import type { APIClient } from '../../../api';
import { ErrorCode } from '../../../errors';
import { listOrganizations } from '@agentuity/server';
import enquirer from 'enquirer';
import type { Logger } from '@agentuity/core';
import { z } from 'zod';
import {
	startGithubIntegration,
	pollForGithubIntegration,
	getGithubIntegrationStatus,
	getExistingGithubIntegrations,
	copyGithubIntegration,
} from '../../integration/api';

export interface RunGitAccountConnectOptions {
	apiClient: APIClient;
	orgId: string;
	orgName?: string;
	logger: Logger;
	config?: Config | null;
	noWait?: boolean;
	json?: boolean;
}

export interface RunGitAccountConnectResult {
	connected: boolean;
	cancelled?: boolean;
	url?: string;
}

export async function runGitAccountConnect(
	options: RunGitAccountConnectOptions
): Promise<RunGitAccountConnectResult> {
	const { apiClient, orgId, orgName, logger, config, noWait, json } = options;
	const orgDisplay = orgName ?? orgId;

	try {
		const currentStatus = await getGithubIntegrationStatus(apiClient, orgId);
		const initialCount = currentStatus.integrations?.length ?? 0;

		const existingIntegrations = await tui.spinner({
			message: 'Checking for existing GitHub connections...',
			clearOnSuccess: true,
			callback: () => getExistingGithubIntegrations(apiClient, orgId),
		});

		const alreadyConnectedNames = new Set(
			currentStatus.integrations?.map((i) => i.githubAccountName) ?? []
		);
		const availableIntegrations = existingIntegrations.filter(
			(i) => !alreadyConnectedNames.has(i.githubAccountName)
		);

		// Skip interactive prompts in --no-wait mode
		if (availableIntegrations.length > 0 && !noWait) {
			tui.newline();

			const integrationChoices = availableIntegrations.map((i) => ({
				name: i.id,
				message: `${i.githubAccountName} ${tui.muted(`(from ${i.orgName})`)}`,
			}));

			console.log(tui.muted('Press enter with none selected to add a new account'));
			tui.newline();

			const selectResponse = await enquirer.prompt<{ integrationIds: string[] }>({
				type: 'multiselect',
				name: 'integrationIds',
				message: 'Select GitHub accounts to add',
				choices: integrationChoices,
			});

			if (selectResponse.integrationIds.length > 0) {
				const selectedIntegrations = availableIntegrations.filter((i) =>
					selectResponse.integrationIds.includes(i.id)
				);

				const accountNames = selectedIntegrations.map((i) => i.githubAccountName).join(', ');

				const confirmResponse = await enquirer.prompt<{ confirm: boolean }>({
					type: 'confirm',
					name: 'confirm',
					message: `Add ${tui.bold(accountNames)} to ${tui.bold(orgDisplay)}?`,
					initial: true,
				});

				if (confirmResponse.confirm) {
					await tui.spinner({
						message: `Adding ${selectedIntegrations.length} GitHub account${selectedIntegrations.length > 1 ? 's' : ''}...`,
						clearOnSuccess: true,
						callback: async () => {
							for (const integration of selectedIntegrations) {
								await copyGithubIntegration(apiClient, integration.orgId, orgId);
							}
						},
					});

					tui.newline();
					tui.success(
						`Added GitHub account${selectedIntegrations.length > 1 ? 's' : ''} to ${tui.bold(orgDisplay)}`
					);
					return { connected: true };
				}
			}
		}

		const startResult = await tui.spinner({
			message: 'Getting GitHub authorization URL...',
			clearOnSuccess: true,
			callback: () => startGithubIntegration(apiClient, orgId),
		});

		if (!startResult) {
			tui.error('Failed to start GitHub authorization');
			return { connected: false };
		}

		const { shortId } = startResult;
		const apiBaseUrl = getAPIBaseURL(config);
		const url = `${apiBaseUrl}/github/connect/${shortId}`;

		// If --no-wait, just return the URL without waiting
		if (noWait) {
			if (!json) {
				tui.newline();
				console.log('GitHub authorization URL:');
				tui.newline();
				console.log(`  ${tui.link(url)}`);
				tui.newline();
			}
			return { connected: false, url };
		}

		const copied = await tui.copyToClipboard(url);

		tui.newline();
		if (copied) {
			console.log('GitHub authorization URL copied to clipboard! Open it in your browser:');
		} else {
			console.log('Open this URL in your browser to authorize GitHub access:');
		}
		tui.newline();
		console.log(`  ${tui.link(url)}`);
		tui.newline();
		console.log(tui.muted('Press Enter to open in your browser, or Ctrl+C to cancel'));
		tui.newline();

		const result = await tui.spinner({
			type: 'countdown',
			message: 'Waiting for GitHub authorization',
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
				return await pollForGithubIntegration(apiClient, orgId, initialCount);
			},
		});

		tui.newline();
		if (result.connected) {
			tui.success(`GitHub account added to ${tui.bold(orgDisplay)}`);
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

const AddOptionsSchema = z.object({
	org: z.string().optional().describe('Organization ID to add the account to'),
	'url-only': z
		.boolean()
		.optional()
		.describe('Output URL and exit without waiting for authorization'),
});

const AddResponseSchema = z.object({
	connected: z.boolean().describe('Whether the account was connected'),
	orgId: z.string().optional().describe('Organization ID'),
	url: z.string().optional().describe('GitHub authorization URL (only with --url-only)'),
});

export const addSubcommand = createSubcommand({
	name: 'add',
	description: 'Add a GitHub account to your organization',
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
			description: 'Add a GitHub account to your organization',
		},
		{
			command: getCommand('git account add --org org_abc123'),
			description: 'Add to a specific organization',
		},
		{
			command: getCommand('git account add --url-only'),
			description: 'Get the GitHub authorization URL without waiting',
		},
	],

	async handler(ctx) {
		const { logger, apiClient, config, opts, options } = ctx;

		try {
			const orgs = await tui.spinner({
				message: 'Fetching organizations...',
				clearOnSuccess: true,
				callback: () => listOrganizations(apiClient),
			});

			if (orgs.length === 0) {
				tui.fatal('No organizations found for your account');
			}

			let orgId = opts.org;
			let selectedOrg: (typeof orgs)[0] | undefined;

			if (orgId) {
				selectedOrg = orgs.find((o) => o.id === orgId);
				if (!selectedOrg) {
					tui.fatal(`Organization ${orgId} not found`);
				}
			} else {
				const orgStatuses = await tui.spinner({
					message: 'Checking GitHub integration status...',
					clearOnSuccess: true,
					callback: async () => {
						const statuses = await Promise.all(
							orgs.map(async (org) => {
								const status = await getGithubIntegrationStatus(apiClient, org.id);
								return {
									...org,
									connected: status.connected,
									integrations: status.integrations,
								};
							})
						);
						return statuses;
					},
				});

				const sortedOrgs = [...orgStatuses].sort((a, b) => a.name.localeCompare(b.name));

				if (orgs.length === 1) {
					orgId = orgs[0].id;
					selectedOrg = orgs[0];
				} else if (opts['url-only']) {
					// In --url-only mode, use first org if --org not specified
					orgId = sortedOrgs[0].id;
					selectedOrg = sortedOrgs[0];
				} else {
					const choices = sortedOrgs.map((org) => {
						const count = org.integrations.length;
						const suffix =
							count > 0
								? tui.muted(` (${count} GitHub account${count > 1 ? 's' : ''})`)
								: '';
						return {
							name: org.name,
							message: `${org.name}${suffix}`,
							value: org.id,
						};
					});

					const response = await enquirer.prompt<{ orgName: string }>({
						type: 'select',
						name: 'orgName',
						message: 'Select an organization',
						choices,
						result(name: string) {
							// @ts-expect-error - this.map exists at runtime
							return this.map(name)[name];
						},
					});

					orgId = response.orgName;
					selectedOrg = sortedOrgs.find((o) => o.id === orgId);
				}
			}

			const result = await runGitAccountConnect({
				apiClient,
				orgId: orgId!,
				orgName: selectedOrg?.name,
				logger,
				config,
				noWait: opts['url-only'],
				json: options.json,
			});

			return { connected: result.connected, orgId, url: result.url };
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
				'Failed to add GitHub account: %s',
				error,
				ErrorCode.INTEGRATION_FAILED
			);
		}
	},
});
