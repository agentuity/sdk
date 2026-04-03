import { type APIClient } from '../api.ts';
import {
	CoderGitHubAccountListResponseSchema,
	type CoderGitHubAccountListResponse,
	CoderGitHubRepositoryListResponseSchema,
	type CoderGitHubRepositoryListResponse,
} from './types.ts';

/**
 * Lists GitHub accounts available via the caller's GitHub App installations.
 */
export async function coderListGitHubAccounts(
	client: APIClient
): Promise<CoderGitHubAccountListResponse> {
	return client.get<CoderGitHubAccountListResponse>(
		'/hub/github/accounts',
		CoderGitHubAccountListResponseSchema
	);
}

/**
 * Lists repositories accessible under a specific GitHub account.
 */
export async function coderListGitHubRepos(
	client: APIClient,
	params: { accountId: string }
): Promise<CoderGitHubRepositoryListResponse> {
	const path = `/hub/github/repos?accountId=${encodeURIComponent(params.accountId)}`;
	return client.get<CoderGitHubRepositoryListResponse>(
		path,
		CoderGitHubRepositoryListResponseSchema
	);
}
