import { createApp } from '@agentuity/runtime';
import events from './src/agent/events/agent';

export default await createApp({
	agents: [events],
});
