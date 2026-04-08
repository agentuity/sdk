import { createApp } from '@agentuity/runtime';
import sse from './src/agent/sse/agent';

export default await createApp({
	agents: [sse],
});
