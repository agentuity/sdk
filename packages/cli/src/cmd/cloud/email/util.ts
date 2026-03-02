import { EmailStorageService, type Logger } from '@agentuity/core';
import { createServerFetchAdapter } from '@agentuity/server';
import { z } from 'zod';
import { getCatalystUrl } from '../../../catalyst';
import { defaultProfileName, getDefaultRegion } from '../../../config';
import * as tui from '../../../tui';
import type { AuthData, Config, GlobalOptions } from '../../../types';

export type {
	EmailAddress,
	EmailAttachment,
	EmailDestination,
	EmailInbound,
	EmailOutbound,
	EmailSendParams,
} from '@agentuity/core';

export interface EmailContext {
	logger: Logger;
	auth: AuthData;
	config: Config | null;
	options: GlobalOptions;
}

export function resolveEmailOrgId(ctx: EmailContext): string {
	const orgId =
		ctx.options.orgId ?? (process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);

	if (!orgId) {
		tui.fatal('Organization ID is required. Use --org-id flag or set AGENTUITY_CLOUD_ORG_ID.');
	}

	return orgId;
}

export const EmailAddressSchema = z.object({
	id: z.string(),
	email: z.string(),
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

export async function createEmailAdapter(ctx: EmailContext, region?: string) {
	const orgId = resolveEmailOrgId(ctx);
	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${ctx.auth.apiKey}`,
				'x-agentuity-orgid': orgId,
			},
		},
		ctx.logger
	);

	const resolvedRegion =
		region ?? (await getDefaultRegion(ctx.config?.name ?? defaultProfileName, ctx.config));
	const baseUrl = getCatalystUrl(resolvedRegion, ctx.config?.overrides);
	return new EmailStorageService(baseUrl, adapter);
}
