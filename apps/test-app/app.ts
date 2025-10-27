import { createApp } from '@agentuity/server';
import { showRoutes } from 'hono/dev';

const { app, server, logger } = createApp();

showRoutes(app);

logger.info('Running %s', server.url);
