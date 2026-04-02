import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import hello from '@agent/hello';

const api = new Hono<Env>().post('/hello', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

export type ApiRouter = typeof api;

export default api;
