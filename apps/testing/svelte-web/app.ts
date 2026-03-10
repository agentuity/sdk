import { createApp } from '@agentuity/runtime';
import router from './src/api/index';

const app = await createApp({
	router: {
		path: '/api',
		router,
	},
});

export default app;
