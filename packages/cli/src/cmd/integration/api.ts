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
	apiClient: APIClient
): Promise<GithubIntegrationStartResult> {
	const resp = await apiClient.get('/cli/github/start', APIResponseSchema(GithubStartDataSchema));

	if (!resp.success) {
		throw new GithubIntegrationStartError({ message: resp.message });
	}

	if (!resp.data) {
		throw new GithubIntegrationStartError();
	}

	return { url: resp.data.url };
}

const PollForGithubIntegrationError = StructuredError('PollForGithubIntegrationError');
const PollForGithubIntegrationTimeout = StructuredError(
	'PollForGithubIntegrationTimeout',
	'Timed out waiting for GitHub integration. Aborting.'
);

export async function pollForGithubIntegration(
	apiClient: APIClient,
	timeoutMs = 600000 // 10 minutes
): Promise<GithubIntegrationStatusResult> {
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		const resp = await apiClient.get(
			'/cli/github/status',
			APIResponseSchema(GithubStatusDataSchema)
		);

		if (!resp.success) {
			throw new PollForGithubIntegrationError({ message: resp.message });
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
