import { Logger, ObjectStorageService } from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import { loadProjectSDKKey } from '../../../config';
import type { Config } from '../../../types';
import * as tui from '../../../tui';

export async function createStorageAdapter(ctx: {
	logger: Logger;
	projectDir: string;
	config: Config | null;
	project: { region: string };
}) {
	const sdkKey = await loadProjectSDKKey(ctx.logger, ctx.projectDir);
	if (!sdkKey) {
		tui.fatal(`Couldn't find the AGENTUITY_SDK_KEY in ${ctx.projectDir} .env file`);
	}

	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${sdkKey}`,
			},
		},
		ctx.logger
	);

	const baseUrl = getServiceUrls(ctx.project.region).catalyst;
	return new ObjectStorageService(baseUrl, adapter);
}
