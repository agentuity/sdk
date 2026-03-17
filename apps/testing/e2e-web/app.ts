import { createApp } from '@agentuity/runtime';
import router from './src/api/router';
import counter from './src/agent/counter/agent';
import hello from './src/agent/hello/agent';

const app = await createApp({
	router: { path: '/api', router },
	agents: [counter, hello],
	analytics: true,
	workbench: '/workbench',
});

export default app;
