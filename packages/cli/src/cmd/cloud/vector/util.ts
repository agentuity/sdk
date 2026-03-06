import { type Logger, VectorStorageService } from '@agentuity/core';
import { createServerFetchAdapter } from '@agentuity/server';
import { getCatalystUrl } from '../../../catalyst';
import * as tui from '../../../tui';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types';

export function createStorageAdapter(
	ctx: {
		logger: Logger;
		auth: AuthData;
		region: string;
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

	const baseUrl = getCatalystUrl(ctx.region, ctx.config?.overrides);
	return new VectorStorageService(baseUrl, adapter);
}
