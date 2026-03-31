import { type Logger, TaskStorageService } from '@agentuity/core';
import { createServerFetchAdapter } from '@agentuity/server';
import { setResourceInfo } from '../../../cache';
import { getCatalystUrl } from '../../../catalyst';
import { defaultProfileName, getDefaultRegion } from '../../../config';
import * as tui from '../../../tui';
import type { AuthData, Config, GlobalOptions } from '../../../types';

export interface TaskContext {
	logger: Logger;
	auth: AuthData;
	config: Config | null;
	options: GlobalOptions;
	project?: {
		projectId: string;
		orgId: string;
	};
}

export async function createStorageAdapter(ctx: TaskContext) {
	const orgId = resolveOrgId(ctx);
	if (!orgId) {
		tui.fatal('Organization ID is required. Use --org-id flag or set AGENTUITY_CLOUD_ORG_ID.');
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
	const orgId = resolveOrgId(ctx);

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

function resolveOrgId(ctx: TaskContext): string | undefined {
	return (
		ctx.options.orgId ??
		process.env.AGENTUITY_CLOUD_ORG_ID ??
		ctx.project?.orgId ??
		ctx.config?.preferences?.orgId
	);
}

export async function cacheTaskId(
	ctx: {
		config: Config | null;
		options: GlobalOptions;
		project?: { orgId: string };
	},
	taskId: string
) {
	const profileName = ctx.config?.name ?? defaultProfileName;
	const region = await getDefaultRegion(profileName, ctx.config);
	const orgId =
		ctx.options.orgId ??
		process.env.AGENTUITY_CLOUD_ORG_ID ??
		ctx.project?.orgId ??
		ctx.config?.preferences?.orgId;
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

const DURATION_UNITS: Record<string, number> = {
	s: 1000,
	m: 60 * 1000,
	h: 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
	w: 7 * 24 * 60 * 60 * 1000,
};

export function parseDuration(duration: string): number {
	const match = duration.match(/^(\d+)([smhdw])$/);
	if (!match) {
		tui.fatal(
			`Invalid duration format: "${duration}". Use a number followed by s (seconds), m (minutes), h (hours), d (days), or w (weeks). Examples: 30s, 30m, 24h, 7d, 2w`
		);
		throw new Error('unreachable');
	}
	const value = parseInt(match[1]!, 10);
	const unit = match[2]!;
	const ms = DURATION_UNITS[unit];
	if (!ms) {
		tui.fatal(`Unknown duration unit: "${unit}"`);
		throw new Error('unreachable');
	}
	return value * ms;
}

export function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}…`;
}

export function resolveMeId(id: string | undefined, ctx: TaskContext): string | undefined {
	if (!id) return undefined;
	if (id === 'me') {
		return ctx.auth.userId;
	}
	return id;
}
