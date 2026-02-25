import { TaskStorageService, type Logger } from '@agentuity/core';
import { createServerFetchAdapter } from '@agentuity/server';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types';
import { getCatalystUrl } from '../../../catalyst';
import { setResourceInfo } from '../../../cache';
import { defaultProfileName, getDefaultRegion } from '../../../config';
import * as tui from '../../../tui';

export async function createStorageAdapter(
	ctx: {
		logger: Logger;
		auth: AuthData;
		region?: string;
		project?: ProjectConfig;
		config: Config | null;
		options: GlobalOptions;
	},
	explicitOrgId?: string
) {
	const orgId =
		explicitOrgId ??
		ctx.project?.orgId ??
		ctx.options.orgId ??
		(process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);
	if (!orgId) {
		tui.fatal(
			'Organization ID is required. Either run from a project directory or use --org-id flag.'
		);
	}

	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${ctx.auth.apiKey}`,
				'x-agentuity-orgid': orgId,
			},
		},
		ctx.logger
	);

	// Task tenant DB is not regional — any Catalyst can serve the request.
	// Use provided region or fall back to default.
	const region =
		ctx.region ?? (await getDefaultRegion(ctx.config?.name ?? defaultProfileName, ctx.config));
	const baseUrl = getCatalystUrl(region);
	return new TaskStorageService(baseUrl, adapter);
}

export async function cacheTaskId(
	ctx: {
		region?: string;
		project?: ProjectConfig;
		config: Config | null;
		options: GlobalOptions;
	},
	taskId: string
) {
	const profileName = ctx.config?.name ?? defaultProfileName;
	const region = ctx.region ?? (await getDefaultRegion(profileName, ctx.config));
	const orgId =
		ctx.project?.orgId ??
		ctx.options.orgId ??
		(process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);
	await setResourceInfo('task', profileName, taskId, region, orgId);
}

export function parseMetadataFlag(raw: string | undefined): Record<string, unknown> | undefined {
	if (!raw) return undefined;
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		tui.fatal('Invalid JSON for --metadata flag');
	}
}
