import { createApp } from '@agentuity/runtime';
import simple from './src/agent/simple/agent';

const app = await createApp({
	agents: [simple],
});

export default app;
