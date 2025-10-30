import { createApp } from '@agentuity/runtime';
import { showRoutes } from 'hono/dev';

if (!process.env.AGENTUITY_SDK_KEY) {
	console.error('missing AGENTUITY_SDK_KEY');
	process.exit(1);
}

const { app, server, logger } = createApp();

showRoutes(app);

logger.info('Running %s', server.url);
