import { createApp } from '@agentuity/runtime';
import aisdk from './src/agent/aisdk/agent';

export default await createApp({
	agents: [aisdk],
});
