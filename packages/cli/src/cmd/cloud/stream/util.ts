import { StreamStorageService, Logger } from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import { loadProjectSDKKey } from '../../../config';
import { ErrorCode } from '../../../errors';
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
		tui.fatal(
			`Couldn't find the AGENTUITY_SDK_KEY in ${ctx.projectDir} .env file`,
			ErrorCode.CONFIG_NOT_FOUND
		);
	}

	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${sdkKey}`,
			},
		},
		ctx.logger
	);

	const baseUrl = getServiceUrls(ctx.project.region).stream;

	ctx.logger.trace('using stream url: %s', baseUrl);

	return new StreamStorageService(baseUrl, adapter);
}
