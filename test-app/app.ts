import { createApp } from '@agentuity/server';

const { server, logger } = createApp();

logger.info('Running %s', server.url);
