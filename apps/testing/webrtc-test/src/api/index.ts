import { createRouter } from '@agentuity/runtime';
import hello from '@agent/hello';

const api = createRouter();

// Hello agent API
api.post('/hello', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

// WebRTC signaling endpoint - creates /api/call/signal
api.webrtc('/call');

export default api;
