import { createApp } from '@agentuity/runtime';

// No need to specify useLocal - it's automatic when unauthenticated
const { server, logger } = createApp();

logger.info('Running with local SQLite services at %s', server.url);
logger.debug('Database location: ~/.config/agentuity/local.db');
