import { createApp } from '@agentuity/runtime';
import aigateway from './src/agent/aigateway/agent';

export default await createApp({
	agents: [aigateway],
});
