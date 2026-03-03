import { createRouter, webrtc } from '@agentuity/runtime';
import hello from '@agent/hello/index.ts';

const api = createRouter();

// Hello agent API
api.post('/hello', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

// WebRTC signaling endpoint at /api/call/signal
api.get('/call/signal', webrtc());

export default api;
