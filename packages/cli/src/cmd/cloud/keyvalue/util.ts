import { KeyValueStorageService, Logger } from '@agentuity/core';
import { createServerFetchAdapter } from '@agentuity/server';
import { loadProjectSDKKey } from '../../../config';
import { ErrorCode } from '../../../errors';
import type { Config } from '../../../types';
import * as tui from '../../../tui';

export async function createStorageAdapter(ctx: {
	logger: Logger;
	projectDir: string;
	config: Config | null;
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

	const baseUrl = ctx.config?.overrides?.catalyst_url ?? 'https://catalyst.agentuity.cloud';
	return new KeyValueStorageService(baseUrl, adapter);
}
