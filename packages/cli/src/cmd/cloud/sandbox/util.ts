import type { Logger } from '@agentuity/core';
import { APIClient, getServiceUrls } from '@agentuity/server';
import type { AuthData } from '../../../types';

export function createSandboxClient(
	logger: Logger,
	auth: AuthData,
	region: string
): APIClient {
	const urls = getServiceUrls(region);
	return new APIClient(urls.catalyst, logger, auth.apiKey);
}
