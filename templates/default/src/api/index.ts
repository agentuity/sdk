import { Hono } from 'hono';
import hello from '@agent/hello';

const api = new Hono();

api.post('/hello', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

export default api;
