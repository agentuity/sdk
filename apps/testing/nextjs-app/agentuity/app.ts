import { createApp } from '@agentuity/runtime';

const app = await createApp();

console.log(`[NextJS-App] Agentuity server started: ${app.server.url}`);

export default app;
