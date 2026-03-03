import { createRouter } from '@agentuity/runtime';
import echoAgent from '../agent/echo/agent';

const api = createRouter();

api.post('/echo', echoAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	return c.json(await echoAgent.run(data));
});

export default api;
