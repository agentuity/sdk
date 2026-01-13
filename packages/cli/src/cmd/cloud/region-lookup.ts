import type { Logger } from '@agentuity/core';
import { projectGet, sandboxGet, type APIClient } from '@agentuity/server';
import { getResourceRegion, setResourceRegion } from '../../cache';
import { getGlobalCatalystAPIClient } from '../../config';
import type { AuthData } from '../../types';
import * as tui from '../../tui';
import { ErrorCode } from '../../errors';

export type IdentifierType = 'project' | 'deployment' | 'sandbox';

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
	// Default to project for unknown prefixes
	return 'project';
}

/**
 * Look up the region for a project, deployment, or sandbox identifier.
 * Uses cache-first strategy with API fallback.
 */
export async function getIdentifierRegion(
	logger: Logger,
	auth: AuthData,
	apiClient: APIClient,
	profileName = 'production',
	identifier: string,
	orgId?: string
): Promise<string> {
	const identifierType = getIdentifierType(identifier);

	// Handle deployment case early - not yet supported for region lookup
	if (identifierType === 'deployment') {
		// Deployments require a project ID to look up, which we don't have here
		// TODO: Consider adding a deployment lookup endpoint that doesn't require project ID
		tui.fatal(
			`Region lookup for deployment '${identifier}' is not yet supported. Use --region flag to specify.`,
			ErrorCode.RESOURCE_NOT_FOUND
		);
	}

	// For project and sandbox, check cache first
	const cachedRegion = await getResourceRegion(identifierType, profileName, identifier);
	if (cachedRegion) {
		logger.trace(`[region-lookup] Found cached region for ${identifier}: ${cachedRegion}`);
		return cachedRegion;
	}

	logger.trace(`[region-lookup] Cache miss for ${identifier}, fetching from API`);

	let region: string | null = null;

	if (identifierType === 'project') {
		const project = await projectGet(apiClient, { id: identifier, mask: true, keys: false });
		region = project.cloudRegion ?? null;
	} else {
		// sandbox
		const globalClient = await getGlobalCatalystAPIClient(logger, auth, profileName);
		const sandbox = await sandboxGet(globalClient, { sandboxId: identifier, orgId });
		region = sandbox.region ?? null;
	}

	if (!region) {
		tui.fatal(
			`Could not determine region for ${identifierType} '${identifier}'. Use --region flag to specify.`,
			ErrorCode.RESOURCE_NOT_FOUND
		);
	}

	// Cache the result
	await setResourceRegion(identifierType, profileName, identifier, region);
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
	await setResourceRegion('project', profileName, projectId, region);
}
