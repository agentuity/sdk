import { KeyValueStorageService, type Logger } from '@agentuity/core/index.ts';
import { createServerFetchAdapter } from '@agentuity/server/index.ts';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types.ts';
import { getCatalystUrl } from '../../../catalyst.ts';
import * as tui from '../../../tui.ts';

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

	const baseUrl = getCatalystUrl(ctx.region);
	return new KeyValueStorageService(baseUrl, adapter);
}
