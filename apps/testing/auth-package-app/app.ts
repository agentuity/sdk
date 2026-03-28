import { createApp } from '@agentuity/runtime';
import router from './src/api/index';
import hello from './src/agent/hello/agent';
import poem from './src/agent/poem/agent';

const { server, logger } = await createApp({
	router: { path: '/api', router },
	agents: [hello, poem],
});

logger.debug('Running %s', server.url);
