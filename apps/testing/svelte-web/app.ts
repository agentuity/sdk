import { createApp } from '@agentuity/runtime';
import router from './src/api/index';
import hello from './src/agent/hello/agent';

const app = await createApp({
	router: { path: '/api', router },
	agents: [hello],
});

export default app;
