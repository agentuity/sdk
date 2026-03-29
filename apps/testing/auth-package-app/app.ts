import { createApp } from '@agentuity/runtime';
import router from './src/api/index';
import hello from './src/agent/hello/agent';
import poem from './src/agent/poem/agent';

const app = await createApp({
	router: { path: '/api', router },
	agents: [hello, poem],
});

app.logger.debug('Running %s', app.server.url);

export default app;
