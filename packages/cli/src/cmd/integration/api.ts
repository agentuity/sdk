import { z } from 'zod';
import { APIResponseSchema } from '@agentuity/server';
import type { APIClient } from '../../api';
import { StructuredError } from '@agentuity/core';

const GithubStartDataSchema = z.object({
	url: z.string(),
});

const GithubStatusDataSchema = z.object({
	connected: z.boolean(),
	integrationId: z.string().optional(),
});

export interface GithubIntegrationStartResult {
	url: string;
}

export interface GithubIntegrationStatusResult {
	connected: boolean;
	integrationId?: string;
}

const GithubIntegrationStartError = StructuredError(
	'GithubIntegrationStartError',
	'Error starting GitHub integration flow'
);

export async function startGithubIntegration(
	apiClient: APIClient,
	orgId: string
): Promise<GithubIntegrationStartResult> {
	const resp = await apiClient.get(
		`/cli/github/start?orgId=${encodeURIComponent(orgId)}`,
		APIResponseSchema(GithubStartDataSchema)
	);

	if (!resp.success) {
		throw new GithubIntegrationStartError();
	}

	if (!resp.data) {
		throw new GithubIntegrationStartError();
	}

	return { url: resp.data.url };
}

const GithubIntegrationStatusError = StructuredError(
	'GithubIntegrationStatusError',
	'Error checking GitHub integration status'
);

export async function getGithubIntegrationStatus(
	apiClient: APIClient,
	orgId: string
): Promise<GithubIntegrationStatusResult> {
	const resp = await apiClient.get(
		`/cli/github/status?orgId=${encodeURIComponent(orgId)}`,
		APIResponseSchema(GithubStatusDataSchema)
	);

	if (!resp.success) {
		throw new GithubIntegrationStatusError();
	}

	if (!resp.data) {
		throw new GithubIntegrationStatusError();
	}

	return {
		connected: resp.data.connected,
		integrationId: resp.data.integrationId,
	};
}

const GithubDisconnectDataSchema = z.object({
	disconnected: z.boolean(),
});

export interface GithubDisconnectResult {
	disconnected: boolean;
}

const GithubDisconnectError = StructuredError(
	'GithubDisconnectError',
	'Error disconnecting GitHub integration'
);

export async function disconnectGithubIntegration(
	apiClient: APIClient,
	orgId: string
): Promise<GithubDisconnectResult> {
	const resp = await apiClient.delete(
		`/cli/github/disconnect?orgId=${encodeURIComponent(orgId)}`,
		APIResponseSchema(GithubDisconnectDataSchema)
	);

	if (!resp.success) {
		throw new GithubDisconnectError();
	}

	if (!resp.data) {
		throw new GithubDisconnectError();
	}

	return { disconnected: resp.data.disconnected };
}

// Existing integrations

const GithubExistingIntegrationSchema = z.object({
	id: z.string(),
	integrationId: z.string().nullable(),
	orgId: z.string(),
	orgName: z.string(),
});

const GithubExistingDataSchema = z.object({
	integrations: z.array(GithubExistingIntegrationSchema),
});

export interface ExistingGithubIntegration {
	id: string;
	integrationId: string | null;
	orgId: string;
	orgName: string;
}

const GithubExistingError = StructuredError(
	'GithubExistingError',
	'Error fetching existing GitHub integrations'
);

export async function getExistingGithubIntegrations(
	apiClient: APIClient,
	excludeOrgId?: string
): Promise<ExistingGithubIntegration[]> {
	const query = excludeOrgId ? `?excludeOrgId=${encodeURIComponent(excludeOrgId)}` : '';
	const resp = await apiClient.get(
		`/cli/github/existing${query}`,
		APIResponseSchema(GithubExistingDataSchema)
	);

	if (!resp.success || !resp.data) {
		throw new GithubExistingError();
	}

	return resp.data.integrations;
}

// Copy integration

const GithubCopyDataSchema = z.object({
	copied: z.boolean(),
});

const GithubCopyError = StructuredError('GithubCopyError', 'Error copying GitHub integration');

export async function copyGithubIntegration(
	apiClient: APIClient,
	fromOrgId: string,
	toOrgId: string
): Promise<boolean> {
	const resp = await apiClient.post(
		'/cli/github/copy',
		{ fromOrgId, toOrgId },
		APIResponseSchema(GithubCopyDataSchema)
	);

	if (!resp.success || !resp.data) {
		throw new GithubCopyError();
	}

	return resp.data.copied;
}

// Polling

const PollForGithubIntegrationError = StructuredError('PollForGithubIntegrationError');
const PollForGithubIntegrationTimeout = StructuredError(
	'PollForGithubIntegrationTimeout',
	'Timed out waiting for GitHub integration. Aborting.'
);

export async function pollForGithubIntegration(
	apiClient: APIClient,
	orgId: string,
	timeoutMs = 600000 // 10 minutes
): Promise<GithubIntegrationStatusResult> {
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		const resp = await apiClient.get(
			`/cli/github/status?orgId=${encodeURIComponent(orgId)}`,
			APIResponseSchema(GithubStatusDataSchema)
		);

		if (!resp.success) {
			throw new PollForGithubIntegrationError();
		}

		if (resp.data?.connected) {
			return {
				connected: true,
				integrationId: resp.data.integrationId,
			};
		}

		await Bun.sleep(2000);
	}

	throw new PollForGithubIntegrationTimeout();
}
