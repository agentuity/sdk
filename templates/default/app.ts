import { createApp } from '@agentuity/runtime';

const { server, logger } = createApp();

logger.debug('Running %s', server.url);
