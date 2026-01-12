import { createApp } from '@agentuity/runtime';

const app = await createApp();

console.log(`[TanStack Start Agent] Server started: ${app.server.url}`);

export default app;
