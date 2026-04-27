import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import { validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const HelloInput = s.object({
	name: s.string(),
});

const api = new Hono<Env>().post('/hello', validator({ input: HelloInput }), async (c) => {
	const { name } = c.req.valid('json');
	return c.text(`Hello, ${name}!`);
});

export type ApiRouter = typeof api;

export default api;
