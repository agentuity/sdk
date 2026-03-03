import { StructuredError } from '@agentuity/core/index.ts';
import { APIResponseSchema } from '@agentuity/server/index.ts';
import { z } from 'zod';
import type { APIClient } from '../../api.ts';

const GithubStartDataSchema = z.object({
	shortId: z.string(),
	hasIdentity: z.boolean(),
});

const GithubInstallationSchema = z.object({
	installationId: z.string(),
	integrationId: z.string().optional(),
	accountName: z.string(),
	accountType: z.enum(['User', 'Organization']),
	avatarUrl: z.string().optional(),
});

const GithubStatusDataSchema = z.object({
	connected: z.boolean(),
	identity: z
		.object({
			githubUsername: z.string(),
			githubEmail: z.string().optional(),
			avatarUrl: z.string().optional(),
		})
		.nullable(),
	installations: z.array(GithubInstallationSchema),
});

export interface GithubInstallation {
	installationId: string;
	integrationId?: string;
	accountName: string;
	accountType: 'User' | 'Organization';
	avatarUrl?: string;
}

export interface GithubIntegrationStartResult {
	shortId: string;
	hasIdentity: boolean;
}

export interface GithubIntegrationStatusResult {
	connected: boolean;
	identity: {
		githubUsername: string;
		githubEmail?: string;
		avatarUrl?: string;
	} | null;
	installations: GithubInstallation[];
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
		throw new GithubIntegrationStartError();
	}

	if (!resp.data) {
		throw new GithubIntegrationStartError();
	}

	return { shortId: resp.data.shortId, hasIdentity: resp.data.hasIdentity };
}

const GithubIntegrationStatusError = StructuredError(
	'GithubIntegrationStatusError',
	'Error checking GitHub integration status'
);

export async function getGithubIntegrationStatus(
	apiClient: APIClient
): Promise<GithubIntegrationStatusResult> {
	const resp = await apiClient.get(
		'/cli/github/status',
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
		identity: resp.data.identity,
		installations: resp.data.installations,
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
	installationId?: string
): Promise<GithubDisconnectResult> {
	let url = '/cli/github/disconnect';
	if (installationId) {
		url += `?installationId=${encodeURIComponent(installationId)}`;
	}
	const resp = await apiClient.delete(url, APIResponseSchema(GithubDisconnectDataSchema));

	if (!resp.success) {
		throw new GithubDisconnectError();
	}

	if (!resp.data) {
		throw new GithubDisconnectError();
	}

	return { disconnected: resp.data.disconnected };
}

// Polling

const PollForGithubIntegrationError = StructuredError('PollForGithubIntegrationError');
const PollForGithubIntegrationTimeout = StructuredError(
	'PollForGithubIntegrationTimeout',
	'Timed out waiting for GitHub integration. Aborting.'
);

export async function pollForGithubIntegration(
	apiClient: APIClient,
	initialCount: number,
	timeoutMs = 600000 // 10 minutes
): Promise<GithubIntegrationStatusResult> {
	const started = Date.now();
	let delay = 2000; // Start with 2 seconds
	const maxDelay = 10000; // Cap at 10 seconds

	while (Date.now() - started < timeoutMs) {
		const resp = await apiClient.get(
			'/cli/github/status',
			APIResponseSchema(GithubStatusDataSchema)
		);

		if (!resp.success || !resp.data) {
			throw new PollForGithubIntegrationError();
		}

		const currentCount = resp.data.installations?.length ?? 0;
		if (currentCount > initialCount) {
			return {
				connected: true,
				identity: resp.data.identity,
				installations: resp.data.installations,
			};
		}

		await Bun.sleep(delay);
		delay = Math.min(delay * 1.5, maxDelay);
	}

	throw new PollForGithubIntegrationTimeout();
}

// Project linking

const GithubRepoSchema = z.object({
	id: z.number(),
	name: z.string(),
	fullName: z.string(),
	private: z.boolean(),
	defaultBranch: z.string(),
	integrationId: z.string(),
});

const GithubReposDataSchema = z.object({
	repos: z.array(GithubRepoSchema),
});

export interface GithubRepo {
	id: number;
	name: string;
	fullName: string;
	private: boolean;
	defaultBranch: string;
	integrationId: string;
}

const GithubReposError = StructuredError('GithubReposError', 'Error fetching GitHub repositories');

export async function listGithubRepos(
	apiClient: APIClient,
	integrationId?: string
): Promise<GithubRepo[]> {
	let url = '/cli/github/repos';
	if (integrationId) {
		url += `?integrationId=${encodeURIComponent(integrationId)}`;
	}
	const resp = await apiClient.get(url, APIResponseSchema(GithubReposDataSchema));

	if (!resp.success || !resp.data) {
		throw new GithubReposError();
	}

	return resp.data.repos;
}

const ProjectLinkDataSchema = z.object({
	linked: z.boolean(),
});

export interface LinkProjectOptions {
	projectId: string;
	repoFullName: string;
	branch: string;
	autoDeploy: boolean;
	previewDeploy: boolean;
	directory?: string;
}

const ProjectLinkError = StructuredError('ProjectLinkError', 'Error linking project to repository');

export async function linkProjectToRepo(
	apiClient: APIClient,
	options: LinkProjectOptions
): Promise<boolean> {
	const resp = await apiClient.post(
		'/cli/github/link',
		options,
		APIResponseSchema(ProjectLinkDataSchema)
	);

	if (!resp.success || !resp.data) {
		throw new ProjectLinkError();
	}

	return resp.data.linked;
}

const ProjectUnlinkDataSchema = z.object({
	unlinked: z.boolean(),
});

const ProjectUnlinkError = StructuredError(
	'ProjectUnlinkError',
	'Error unlinking project from repository'
);

export async function unlinkProjectFromRepo(
	apiClient: APIClient,
	projectId: string
): Promise<boolean> {
	const resp = await apiClient.delete(
		`/cli/github/unlink?projectId=${encodeURIComponent(projectId)}`,
		APIResponseSchema(ProjectUnlinkDataSchema)
	);

	if (!resp.success || !resp.data) {
		throw new ProjectUnlinkError();
	}

	return resp.data.unlinked;
}

const ProjectGithubStatusSchema = z.object({
	linked: z.boolean(),
	repoFullName: z.string().optional(),
	branch: z.string().optional(),
	autoDeploy: z.boolean().optional(),
	previewDeploy: z.boolean().optional(),
	directory: z.string().optional(),
});

export interface ProjectGithubStatus {
	linked: boolean;
	repoFullName?: string;
	branch?: string;
	autoDeploy?: boolean;
	previewDeploy?: boolean;
	directory?: string;
}

const ProjectGithubStatusError = StructuredError(
	'ProjectGithubStatusError',
	'Error fetching project GitHub status'
);

export async function getProjectGithubStatus(
	apiClient: APIClient,
	projectId: string
): Promise<ProjectGithubStatus> {
	const resp = await apiClient.get(
		`/cli/github/project-status?projectId=${encodeURIComponent(projectId)}`,
		APIResponseSchema(ProjectGithubStatusSchema)
	);

	if (!resp.success || !resp.data) {
		throw new ProjectGithubStatusError();
	}

	return resp.data;
}
