import type { Logger } from '@agentuity/core/index.ts';
import { APIClient, type WebhookApiOptions } from '@agentuity/server/index.ts';
import { getGlobalCatalystAPIClient } from '../../../config.ts';
import type { AuthData, Config, GlobalOptions } from '../../../types.ts';

/**
 * Context required for webhook API operations.
 */
export interface WebhookContext {
	logger: Logger;
	auth: AuthData;
	config: Config | null;
	options: GlobalOptions;
	orgId?: string;
}

/**
 * Creates an API client for webhook operations.
 *
 * Webhooks are global resources that don't require a project context.
 * Uses the global Catalyst API client with user authentication.
 */
export async function createWebhookAPIClient(ctx: WebhookContext): Promise<APIClient> {
	return getGlobalCatalystAPIClient(ctx.logger, ctx.auth, ctx.config?.name);
}

/**
 * Creates WebhookApiOptions from the CLI context.
 * Prioritizes explicit orgId on context, then falls back to global --org-id option,
 * and finally to the preferred org from the profile configuration.
 */
export function getWebhookApiOptions(ctx: WebhookContext): WebhookApiOptions | undefined {
	const orgId = ctx.orgId ?? ctx.options.orgId ?? ctx.config?.preferences?.orgId;
	return orgId ? { orgId } : undefined;
}
