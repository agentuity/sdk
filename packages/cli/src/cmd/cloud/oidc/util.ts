import type { Logger } from '@agentuity/core';
import { getGlobalCatalystAPIClient } from '../../../config.ts';
import * as tui from '../../../tui.ts';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types.ts';

export async function createOAuthClient(
	ctx: {
		logger: Logger;
		auth: AuthData;
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

	return getGlobalCatalystAPIClient(ctx.logger, ctx.auth, ctx.config?.name, orgId, ctx.config);
}
