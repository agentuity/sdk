import { StreamStorageService, type Logger } from '@agentuity/core/index.ts';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server/index.ts';
import { loadProjectSDKKey } from '../../../config.ts';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types.ts';
import * as tui from '../../../tui.ts';

/**
 * Create a storage adapter for stream operations that create new streams.
 * This is used by the `stream create` command.
 *
 * For listing and deleting streams, use the CLI API endpoints (streamList, streamGet)
 * which handle org resolution automatically based on user's org membership.
 *
 * @param ctx - Command context including auth, region, and optional project context
 * @returns A StreamStorageService instance configured for the org
 */
export async function createStorageAdapter(ctx: {
	logger: Logger;
	projectDir: string;
	auth: AuthData;
	region: string;
	project?: ProjectConfig;
	config: Config | null;
	options: GlobalOptions;
}) {
	// Try to get SDK key from project context first (preferred for project-based auth)
	const sdkKey = await loadProjectSDKKey(ctx.logger, ctx.projectDir);

	let authToken: string;
	let queryParams: Record<string, string> | undefined;

	if (sdkKey) {
		// Use SDK key auth (project context available)
		authToken = sdkKey;
		ctx.logger.trace('using SDK key auth for stream');
	} else {
		// Use CLI key auth with orgId query param
		// Pulse server expects orgId as query param for CLI tokens (ck_*)
		// For create operations, we need to know which org to create the stream in
		const orgId =
			ctx.options.orgId ??
			process.env.AGENTUITY_CLOUD_ORG_ID ??
			ctx.config?.preferences?.orgId ??
			ctx.project?.orgId;

		if (!orgId) {
			tui.fatal(
				'Organization ID is required for creating streams. Either run from a project directory, use --org-id flag, or set AGENTUITY_CLOUD_ORG_ID environment variable.'
			);
		}

		authToken = ctx.auth.apiKey;
		queryParams = { orgId };
		ctx.logger.trace('using CLI key auth with orgId query param for stream');
	}

	const baseUrl = getServiceUrls(ctx.region).stream;

	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${authToken}`,
			},
			queryParams,
		},
		ctx.logger
	);

	ctx.logger.trace('using stream url: %s', baseUrl);

	return new StreamStorageService(baseUrl, adapter);
}

/**
 * Create a storage adapter for a specific org ID.
 * Used when listing streams across multiple orgs.
 */
export function createStorageAdapterForOrg(ctx: {
	logger: Logger;
	auth: AuthData;
	region: string;
	orgId: string;
}) {
	const baseUrl = getServiceUrls(ctx.region).stream;

	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${ctx.auth.apiKey}`,
			},
			queryParams: { orgId: ctx.orgId },
		},
		ctx.logger
	);

	ctx.logger.trace('using stream url: %s for org: %s', baseUrl, ctx.orgId);

	return new StreamStorageService(baseUrl, adapter);
}
