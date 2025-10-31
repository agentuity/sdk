import { createApp } from '@agentuity/runtime';

if (!process.env.AGENTUITY_SDK_KEY) {
	console.error('missing AGENTUITY_SDK_KEY');
	process.exit(1);
}

const { server, logger } = createApp();

logger.debug('Running %s', server.url);
