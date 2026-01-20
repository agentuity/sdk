import { type Logger, VectorStorageService } from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import type { AuthData, GlobalOptions, ProjectConfig } from '../../../types';
import * as tui from '../../../tui';

export function createStorageAdapter(ctx: {
	logger: Logger;
	auth: AuthData;
	region: string;
	project?: ProjectConfig;
	options: GlobalOptions;
}) {
	const orgId = ctx.project?.orgId ?? ctx.options.orgId;
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

	const urls = getServiceUrls(ctx.region);
	const baseUrl = urls.catalyst;
	return new VectorStorageService(baseUrl, adapter);
}
