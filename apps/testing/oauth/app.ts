import { createApp } from '@agentuity/runtime';

const { server, logger } = await createApp();

logger.debug('Running %s', server.url);
