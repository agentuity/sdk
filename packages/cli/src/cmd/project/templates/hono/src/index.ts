import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { LandingPage } from './landing.js';
import { translate } from './translate.js';


const app = new Hono();

// API route
app.post('/api/translate', async (c) => {
	const { text, toLanguage, model = 'openai/gpt-4o-mini' } = await c.req.json();
	const result = await translate({ text, toLanguage, model });
	return c.json(result);
});


// Landing page
app.get('/', (c) => {
	return c.html(LandingPage());
});

const port = Number(process.env.PORT ?? 3000);
// Bind all interfaces so container readiness probes (e.g. `nc -z 127.0.0.1`)
// can reach the server; default Node bind can be IPv6-only on some images.
const hostname = process.env.HOST ?? '0.0.0.0';

serve(
	{
		fetch: app.fetch,
		port,
		hostname,
	},
	(info) => {
		console.log(`Server is running on http://${hostname}:${info.port}`);
	}
);

export default app;
