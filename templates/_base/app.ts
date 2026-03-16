import { createApp } from '@agentuity/runtime';
import api from './src/api/index';

const { server, logger } = await createApp({
	router: { path: '/api', router: api },
});

logger.debug('Running %s', server.url);
