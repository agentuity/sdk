import { createApp } from '@agentuity/runtime';
import router from './src/api';
import agents from './src/agent';

const { server, logger } = await createApp({
	router: { path: '/api', router },
	agents,
});

logger.debug('Running %s', server.url);
