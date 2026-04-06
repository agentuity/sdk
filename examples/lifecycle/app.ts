import { createApp } from '@agentuity/runtime';
import lifecycle from './src/agent/lifecycle/agent';

export default await createApp({
	agents: [lifecycle],
});
