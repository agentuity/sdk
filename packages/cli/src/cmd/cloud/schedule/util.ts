import { ScheduleService, type Logger } from '@agentuity/core/index.ts';
import { createServerFetchAdapter } from '@agentuity/server/index.ts';
import type { AuthData, Config, GlobalOptions } from '../../../types.ts';
import { getCatalystUrl } from '../../../catalyst.ts';
import { defaultProfileName, getDefaultRegion } from '../../../config.ts';
import * as tui from '../../../tui.ts';

export interface ScheduleContext {
	logger: Logger;
	auth: AuthData;
	config: Config | null;
	options: GlobalOptions;
}

export async function createScheduleAdapter(ctx: ScheduleContext) {
	const orgId =
		ctx.options.orgId ?? (process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);
	if (!orgId) {
		tui.fatal('Organization ID is required. Use --org-id flag or set AGENTUITY_CLOUD_ORG_ID.');
	}
	const adapter = createServerFetchAdapter(
		{ headers: { Authorization: `Bearer ${ctx.auth.apiKey}`, 'x-agentuity-orgid': orgId } },
		ctx.logger
	);
	const region = await getDefaultRegion(ctx.config?.name ?? defaultProfileName, ctx.config);
	const baseUrl = getCatalystUrl(region);
	return new ScheduleService(baseUrl, adapter);
}
