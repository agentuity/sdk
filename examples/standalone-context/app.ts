import { createApp, createRouter } from '@agentuity/runtime';
import greeting from './agents/greeting';

export const router = createRouter();

export const app = await createApp({
	router,
	agents: [greeting],
});
