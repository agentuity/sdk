import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import echoAgent from '../agent/echo/agent';

const api = new Hono<Env>().post('/echo', echoAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	return c.json(await echoAgent.run(data));
});

export type ApiRouter = typeof api;

export default api;
