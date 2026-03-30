import { type Logger, TaskStorageService } from '@agentuity/core';
import { createServerFetchAdapter } from '@agentuity/server';
import { setResourceInfo } from '../../../cache';
import { getCatalystUrl } from '../../../catalyst';
import { defaultProfileName, getDefaultRegion } from '../../../config';
import * as tui from '../../../tui';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types';

export interface TaskContext {
	logger: Logger;
	auth: AuthData;
	config: Config | null;
	options: GlobalOptions;
	project?: ProjectConfig;
}

export async function createStorageAdapter(ctx: TaskContext) {
	const orgId =
		ctx.options.orgId ??
		ctx.project?.orgId ??
		(process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);
	if (!orgId) {
		tui.fatal(
			'Organization ID is required. Run from a project directory, pass --org-id, set AGENTUITY_CLOUD_ORG_ID, or configure a default org in your profile.'
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
	const region = await getDefaultRegion(ctx.config?.name ?? defaultProfileName, ctx.config);
	const baseUrl = getCatalystUrl(region, ctx.config?.overrides);
	return new TaskStorageService(baseUrl, adapter);
}

export async function createStorageAdapterOptionalOrg(ctx: TaskContext) {
	const orgId =
		ctx.options.orgId ??
		ctx.project?.orgId ??
		(process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);

	const headers: Record<string, string> = {
		Authorization: `Bearer ${ctx.auth.apiKey}`,
	};
	if (orgId) {
		headers['x-agentuity-orgid'] = orgId;
	}

	const adapter = createServerFetchAdapter({ headers }, ctx.logger);

	const region = await getDefaultRegion(ctx.config?.name ?? defaultProfileName, ctx.config);
	const baseUrl = getCatalystUrl(region, ctx.config?.overrides);
	return new TaskStorageService(baseUrl, adapter);
}

export async function cacheTaskId(
	ctx: {
		config: Config | null;
		options: GlobalOptions;
		project?: ProjectConfig;
	},
	taskId: string
) {
	const profileName = ctx.config?.name ?? defaultProfileName;
	const region = await getDefaultRegion(profileName, ctx.config);
	const orgId =
		ctx.options.orgId ??
		ctx.project?.orgId ??
		(process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);
	await setResourceInfo('task', profileName, taskId, region, orgId);
}

/**
 * Resolve the `me` shorthand to the authenticated user's ID.
 * If the value is literally `"me"`, returns `ctx.auth.userId`.
 * Otherwise returns the value unchanged.
 */
export function resolveUserIdOrMe(
	value: string | undefined,
	ctx: { auth: AuthData }
): string | undefined {
	if (!value) return undefined;
	return value === 'me' ? ctx.auth.userId : value;
}

export function parseMetadataFlag(raw: string | undefined): Record<string, unknown> | undefined {
	if (!raw) return undefined;
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		tui.fatal('Invalid JSON for --metadata flag');
	}
}
