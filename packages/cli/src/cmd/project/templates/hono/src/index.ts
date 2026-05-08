// @agentuity:imports
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { LandingPage } from './landing.js';
import { translate } from './translate.js';

// @agentuity:module

const app = new Hono();

// API route
app.post('/api/translate', async (c) => {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await c.req.json();
	const result = await translate({ text, toLanguage, model });
	return c.json(result);
});

// @agentuity:routes

// Landing page
app.get('/', (c) => {
	return c.html(LandingPage());
});

const port = Number(process.env.PORT ?? 3000);

serve(
	{
		fetch: app.fetch,
		port,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	}
);

export default app;
