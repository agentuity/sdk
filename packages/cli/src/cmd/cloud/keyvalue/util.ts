import { KeyValueClient } from '@agentuity/keyvalue';
import type { Logger } from '@agentuity/core';
import { getCatalystUrl } from '../../../catalyst.ts';
import * as tui from '../../../tui.ts';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types.ts';

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

	const baseUrl = getCatalystUrl(ctx.region, ctx.config?.overrides);
	return new KeyValueClient({
		apiKey: ctx.auth.apiKey,
		orgId,
		url: baseUrl,
		logger: ctx.logger,
	});
}
