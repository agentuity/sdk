import { createApp } from '@agentuity/runtime';

const app = await createApp();

console.log(`[Vite-RSC-App] Agentuity server started: ${app.server.url}`);

export default app;
