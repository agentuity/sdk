import { createApp } from '@agentuity/runtime';
import router from './src/api/router';

createApp({
	router: {
		path: '/api',
		router,
	},
});
