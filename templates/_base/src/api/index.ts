import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';

const api = new Hono<Env>().get('/hello', (c) => {
	return c.json({ message: 'Hello from Agentuity!' });
});

export type ApiRouter = typeof api;

export default api;
