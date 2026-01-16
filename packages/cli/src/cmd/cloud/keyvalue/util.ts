import { KeyValueStorageService, type Logger } from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import { getDefaultRegion } from '../../../config';
import type { AuthData, Config } from '../../../types';

export async function createStorageAdapter(ctx: {
	logger: Logger;
	config: Config | null;
	auth: AuthData;
	project?: { region: string };
}) {
	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${ctx.auth.apiKey}`,
			},
		},
		ctx.logger
	);

	const region = ctx.project?.region || (await getDefaultRegion(ctx.config?.name, ctx.config));
	const urls = getServiceUrls(region);
	const baseUrl = urls.catalyst;
	return new KeyValueStorageService(baseUrl, adapter);
}
