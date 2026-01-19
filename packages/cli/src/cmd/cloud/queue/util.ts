import type { Logger } from '@agentuity/core';
import { APIClient, type QueueApiOptions } from '@agentuity/server';
import { getGlobalCatalystAPIClient } from '../../../config';
import type { AuthData, Config, GlobalOptions } from '../../../types';

/**
 * Context required for queue API operations.
 */
export interface QueueContext {
	logger: Logger;
	auth: AuthData;
	config: Config | null;
	options: GlobalOptions;
	orgId?: string;
}

/**
 * Creates an API client for queue operations.
 *
 * Queues are global resources that don't require a project context.
 * Uses the global Catalyst API client with user authentication.
 */
export async function createQueueAPIClient(ctx: QueueContext): Promise<APIClient> {
	return getGlobalCatalystAPIClient(ctx.logger, ctx.auth, ctx.config?.name);
}

/**
 * Creates QueueApiOptions from the CLI context.
 * Prioritizes explicit orgId on context, then falls back to global --org-id option.
 */
export function getQueueApiOptions(ctx: QueueContext): QueueApiOptions | undefined {
	const orgId = ctx.orgId ?? ctx.options.orgId;
	return orgId ? { orgId } : undefined;
}
