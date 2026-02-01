import { StreamStorageService, type Logger } from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import { loadProjectSDKKey } from '../../../config';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types';
import * as tui from '../../../tui';

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
		// IMPORTANT: For CLI key auth, prefer user's org ID over project's org ID
		// because the CLI key is validated against the user's orgs, not the project's org
		const orgId =
			ctx.options.orgId ??
			process.env.AGENTUITY_CLOUD_ORG_ID ??
			ctx.config?.preferences?.orgId ??
			ctx.project?.orgId;

		if (!orgId) {
			tui.fatal(
				'Organization ID is required. Either run from a project directory, use --org-id flag, or set AGENTUITY_CLOUD_ORG_ID environment variable.'
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
