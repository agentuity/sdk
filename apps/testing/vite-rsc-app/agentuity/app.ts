import { createApp } from '@agentuity/runtime';
import router from './src/api/index';

const app = await createApp({
	router: { path: '/api', router },
});

console.log(`[Vite-RSC-App] Agentuity server started: ${app.server.url}`);

export default app;
