import { z } from 'zod';
import { EmailStorageService, type Logger } from '@agentuity/core';
import { createServerFetchAdapter } from '@agentuity/server';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types';
import { getCatalystUrl } from '../../../catalyst';
import * as tui from '../../../tui';

export type {
	EmailAddress,
	EmailDestination,
	EmailInbound,
	EmailOutbound,
	EmailAttachment,
	EmailSendParams,
} from '@agentuity/core';

interface EmailContext {
	logger: Logger;
	auth: AuthData;
	region?: string;
	project?: ProjectConfig;
	config: Config | null;
	options: GlobalOptions;
}

export function resolveEmailOrgId(ctx: EmailContext, explicitOrgId?: string): string {
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

	return orgId;
}

export function resolveEmailRegion(ctx: EmailContext): string {
	if (ctx.region) {
		return ctx.region;
	}
	if (process.env.AGENTUITY_REGION) {
		return process.env.AGENTUITY_REGION;
	}
	if (ctx.config?.name === 'local') {
		return 'local';
	}
	if (ctx.config?.preferences?.region) {
		return ctx.config.preferences.region;
	}
	return 'usc';
}

export const EmailAddressSchema = z.object({
	id: z.string(),
	email: z.string(),
	project_id: z.string().optional(),
	provider: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});

export function truncate(value: string | undefined, length = 200): string {
	if (!value) {
		return '-';
	}
	return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

export function createEmailAdapter(ctx: EmailContext, explicitOrgId?: string) {
	const orgId = resolveEmailOrgId(ctx, explicitOrgId);
	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${ctx.auth.apiKey}`,
				'x-agentuity-orgid': orgId,
			},
		},
		ctx.logger
	);

	const baseUrl = getCatalystUrl(resolveEmailRegion(ctx));
	return new EmailStorageService(baseUrl, adapter);
}
