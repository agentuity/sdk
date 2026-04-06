import { createApp } from '@agentuity/runtime';
import readableStream from './src/agent/readable-stream/agent';

export default await createApp({
	agents: [readableStream],
});
