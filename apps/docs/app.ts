import { createApp } from '@agentuity/runtime';
import router from './src/api';
import agents from './src/agent';

const app = await createApp({
	router: { path: '/api', router },
	agents,
});

app.logger.debug('Running %s', app.server.url);

export default app;
