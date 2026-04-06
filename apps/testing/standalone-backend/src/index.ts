/**
 * Standalone Backend
 *
 * A bare-minimum Hono server — the simplest thing you can deploy on Agentuity.
 * No agents, no runtime, no framework magic. Just an HTTP server.
 */

import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health', (c) => {
	return c.json({ healthy: true, uptime: process.uptime() });
});

app.post('/echo', async (c) => {
	const body = await c.req.json();
	return c.json({ echo: body, receivedAt: new Date().toISOString() });
});

const port = parseInt(process.env.PORT || '3000', 10);

export default {
	port,
	fetch: app.fetch,
};
