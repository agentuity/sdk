import { createApp } from '@agentuity/runtime';
import websocket from './src/agent/websocket/agent';

export default await createApp({
	agents: [websocket],
});
