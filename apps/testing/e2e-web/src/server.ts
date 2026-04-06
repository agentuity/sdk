/**
 * E2E Web Test Backend
 *
 * A basic Hono server with a few routes for end-to-end web testing.
 * Serves a minimal HTML page and API endpoints.
 */

import { Hono } from 'hono';

const app = new Hono();

// ── API routes ───────────────────────────────────────────────────────────────

app.get('/api/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/echo', async (c) => {
	const body = await c.req.json();
	return c.json({ echo: body, receivedAt: new Date().toISOString() });
});

app.get('/api/counter', (c) => {
	// Simple stateless counter for testing — returns a random value each time
	return c.json({ count: Math.floor(Math.random() * 1000) });
});

// ── HTML page ────────────────────────────────────────────────────────────────

app.get('/', (c) => {
	return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>E2E Test App</title></head>
<body>
	<h1 id="title">E2E Test App</h1>
	<button id="echo-btn" onclick="doEcho()">Echo</button>
	<pre id="result"></pre>
	<script>
		async function doEcho() {
			const res = await fetch('/api/echo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'hello from browser' }),
			});
			document.getElementById('result').textContent = JSON.stringify(await res.json(), null, 2);
		}
	</script>
</body>
</html>`);
});

const port = parseInt(process.env.PORT || '3000', 10);

export default {
	port,
	fetch: app.fetch,
};
