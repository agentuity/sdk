import { StreamStorageService, type Logger } from '@agentuity/core';
import {
	projectGet,
	sandboxResolve,
	deploymentGet,
	getWebhook,
	type APIClient,
	createServerFetchAdapter,
	getServiceUrls,
} from '@agentuity/server';
import { getResourceInfo, setResourceInfo } from '../../cache';
import { getDefaultRegion } from '../../config';
import type { AuthData, Config } from '../../types';
import * as tui from '../../tui';
import { ErrorCode } from '../../errors';

export type IdentifierType = 'project' | 'deployment' | 'sandbox' | 'stream' | 'webhook';

/**
 * Determine the type of identifier based on its prefix
 */
export function getIdentifierType(identifier: string): IdentifierType {
	if (identifier.startsWith('proj_')) {
		return 'project';
	}
	if (identifier.startsWith('deploy_')) {
		return 'deployment';
	}
	if (identifier.startsWith('sbx_')) {
		return 'sandbox';
	}
	if (identifier.startsWith('stream_')) {
		return 'stream';
	}
	if (identifier.startsWith('wh_')) {
		return 'webhook';
	}
	// Default to project for unknown prefixes
	return 'project';
}

/**
 * Look up the region for a project, deployment, sandbox, or stream identifier.
 * Uses cache-first strategy with API fallback.
 *
 * @param apiClient - Required for project/deployment lookups, optional for sandbox/stream
 *                    (they create their own clients internally)
 */
export async function getIdentifierRegion(
	logger: Logger,
	auth: AuthData,
	apiClient: APIClient | undefined,
	profileName = 'production',
	identifier: string,
	orgId?: string,
	config?: Config | null
): Promise<string> {
	const identifierType = getIdentifierType(identifier);

	// For project, deployment, and sandbox, check cache first
	const cachedInfo = await getResourceInfo(identifierType, profileName, identifier);
	if (cachedInfo?.region) {
		logger.trace(`[region-lookup] Found cached region for ${identifier}: ${cachedInfo.region}`);
		return cachedInfo.region;
	}

	logger.trace(`[region-lookup] Cache miss for ${identifier}, fetching from API`);

	let region: string | null = null;

	if (identifierType === 'project') {
		if (!apiClient) {
			tui.fatal(
				`API client required for project region lookup. This is an internal error.`,
				ErrorCode.INVALID_ARGUMENT
			);
		}
		const project = await projectGet(apiClient, { id: identifier, mask: true, keys: false });
		region = project.cloudRegion ?? null;
	} else if (identifierType === 'deployment') {
		if (!apiClient) {
			tui.fatal(
				`API client required for deployment region lookup. This is an internal error.`,
				ErrorCode.INVALID_ARGUMENT
			);
		}
		const deployment = await deploymentGet(apiClient, identifier);
		region = deployment.cloudRegion ?? null;
	} else if (identifierType === 'sandbox') {
		// sandbox - use CLI API to resolve across all orgs the user has access to
		if (!apiClient) {
			tui.fatal(
				`API client required for sandbox region lookup. This is an internal error.`,
				ErrorCode.INVALID_ARGUMENT
			);
		}
		const sandbox = await sandboxResolve(apiClient, identifier);
		region = sandbox.region ?? null;
		// Cache the orgId along with the region for future lookups
		if (sandbox.orgId) {
			orgId = sandbox.orgId;
		}
	} else if (identifierType === 'webhook') {
		// Webhook tenant DB is not regional — any global Catalyst can serve the request.
		// We still look up the webhook to validate it exists and cache the orgId.
		if (!apiClient) {
			tui.fatal(
				`API client required for webhook region lookup. This is an internal error.`,
				ErrorCode.INVALID_ARGUMENT
			);
		}
		const resolvedOrgId =
			orgId ?? process.env.AGENTUITY_CLOUD_ORG_ID ?? config?.preferences?.orgId;
		const webhook = await getWebhook(
			apiClient,
			identifier,
			resolvedOrgId ? { orgId: resolvedOrgId } : undefined
		);
		if (webhook) {
			orgId = resolvedOrgId;
		}
		// Use default region since webhooks are global
		region = await getDefaultRegion(profileName, config);
	} else {
		// stream - use the streams service to look up stream info
		// Any regional streams service can look up any stream and return its info
		// The service authenticates based on user's org membership, no explicit orgId needed
		const defaultRegion = await getDefaultRegion(profileName, config);
		const baseUrl = getServiceUrls(defaultRegion).stream;

		// Include orgId if available, but don't require it
		const resolvedOrgId =
			orgId ?? process.env.AGENTUITY_CLOUD_ORG_ID ?? config?.preferences?.orgId;

		const adapter = createServerFetchAdapter(
			{
				headers: {
					Authorization: `Bearer ${auth.apiKey}`,
				},
				queryParams: resolvedOrgId ? { orgId: resolvedOrgId } : undefined,
			},
			logger
		);

		const streamService = new StreamStorageService(baseUrl, adapter);
		const streamInfo = await streamService.get(identifier);

		// Extract region from the stream URL (e.g., https://streams-use.agentuity.cloud/...)
		const urlMatch = streamInfo.url.match(/https:\/\/streams-([^.]+)\.agentuity\.cloud/);
		if (urlMatch?.[1]) {
			region = urlMatch[1];
		} else if (streamInfo.url.includes('streams.agentuity.io')) {
			// Local environment
			region = 'local';
		}
	}

	if (!region) {
		tui.fatal(
			`Could not determine region for ${identifierType} '${identifier}'. Use --region flag to specify.`,
			ErrorCode.RESOURCE_NOT_FOUND
		);
	}

	// Validate region is a non-empty string
	if (typeof region !== 'string' || region.trim() === '') {
		tui.fatal(
			`Invalid region returned for ${identifierType} '${identifier}': '${region}'. Use --region flag to specify a valid region.`,
			ErrorCode.RESOURCE_NOT_FOUND
		);
	}

	// Cache the result
	await setResourceInfo(identifierType, profileName, identifier, region, orgId);
	logger.trace(`[region-lookup] Cached region for ${identifier}: ${region}`);

	return region;
}

/**
 * Cache the region for a project after creation
 */
export async function cacheProjectRegion(
	profileName = 'production',
	projectId: string,
	region: string
): Promise<void> {
	await setResourceInfo('project', profileName, projectId, region);
}
