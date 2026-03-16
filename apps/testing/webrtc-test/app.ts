import { createApp } from '@agentuity/runtime';
import router from './src/api/index';
import hello from './src/agent/hello/agent';

const { server, logger } = await createApp({
	router: { path: '/api', router },
	agents: [hello],
});

logger.debug('Running %s', server.url);
