import { z } from 'zod';
import { APIResponseSchema } from '@agentuity/server';
import type { APIClient } from '../../api';
import { StructuredError } from '@agentuity/core';

const GithubStartDataSchema = z.object({
	shortId: z.string(),
});

const GithubIntegrationSchema = z.object({
	id: z.string(),
	githubAccountName: z.string(),
	githubAccountType: z.enum(['user', 'org']),
	connectedBy: z.string(),
	connectedAt: z.string(),
});

const GithubStatusDataSchema = z.object({
	connected: z.boolean(),
	integrations: z.array(GithubIntegrationSchema).optional(),
});

export interface GithubIntegration {
	id: string;
	githubAccountName: string;
	githubAccountType: 'user' | 'org';
	connectedBy: string;
	connectedAt: string;
}

export interface GithubIntegrationStartResult {
	shortId: string;
}

export interface GithubIntegrationStatusResult {
	connected: boolean;
	integrations: GithubIntegration[];
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

	return { shortId: resp.data.shortId };
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
		integrations: resp.data.integrations ?? [],
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
	orgId: string,
	integrationId: string
): Promise<GithubDisconnectResult> {
	const resp = await apiClient.delete(
		`/cli/github/disconnect?orgId=${encodeURIComponent(orgId)}&integrationId=${encodeURIComponent(integrationId)}`,
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
	githubAccountName: z.string(),
});

const GithubExistingDataSchema = z.object({
	integrations: z.array(GithubExistingIntegrationSchema),
});

export interface ExistingGithubIntegration {
	id: string;
	integrationId: string | null;
	orgId: string;
	orgName: string;
	githubAccountName: string;
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
	initialCount: number,
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

		const currentCount = resp.data?.integrations?.length ?? 0;
		if (currentCount > initialCount) {
			return {
				connected: true,
				integrations: resp.data?.integrations ?? [],
			};
		}

		await Bun.sleep(2000);
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
	orgId: string,
	integrationId?: string
): Promise<GithubRepo[]> {
	let url = `/cli/github/repos?orgId=${encodeURIComponent(orgId)}`;
	if (integrationId) {
		url += `&integrationId=${encodeURIComponent(integrationId)}`;
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
	integrationId?: string;
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
		throw new ProjectLinkError({ message: resp.message });
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
