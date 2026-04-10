/**
 * Integration Suite
 *
 * A plain Hono backend that exercises all Agentuity services.
 * Used for end-to-end integration testing of the service client packages.
 *
 * Each route group tests a different Agentuity service:
 * - /api/kv — Key-Value store
 * - /api/vector — Vector search
 * - /api/queue — Queue operations
 * - /api/health — Health check
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

const app = new Hono();

async function parseJson(c: Context) {
	try {
		return await c.req.json();
	} catch (err) {
		throw new Error('Invalid request body', { cause: err });
	}
}

app.get('/', (c) => {
	return c.json({
		name: 'integration-suite',
		description: 'Agentuity services integration tests',
		services: ['keyvalue', 'vector', 'queue', 'email', 'schedule', 'task'],
	});
});

app.get('/api/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Key-Value ────────────────────────────────────────────────────────────────

app.post('/api/kv/set', async (c) => {
	const { key, value } = await parseJson(c);
	// TODO: Use @agentuity/keyvalue client
	return c.json({ ok: true, key, value });
});

app.get('/api/kv/get/:key', async (c) => {
	const key = c.req.param('key');
	// TODO: Use @agentuity/keyvalue client
	return c.json({ key, value: null });
});

// ── Vector ───────────────────────────────────────────────────────────────────

app.post('/api/vector/upsert', async (c) => {
	const body = await parseJson(c);
	// TODO: Use @agentuity/vector client
	return c.json({ ok: true, id: body.id });
});

app.post('/api/vector/search', async (c) => {
	const { query } = await parseJson(c);
	// TODO: Use @agentuity/vector client
	return c.json({ query, results: [] });
});

// ── Queue ────────────────────────────────────────────────────────────────────

app.post('/api/queue/publish', async (c) => {
	const _body = await parseJson(c);
	// TODO: Use @agentuity/queue client
	return c.json({ ok: true, messageId: `msg_${Date.now()}` });
});

const parsedPort = Number.parseInt(process.env.PORT ?? '3000', 10);
export const port = Number.isNaN(parsedPort) ? 3000 : parsedPort;
export const fetch = app.fetch;

export default {
	port,
	fetch,
};
