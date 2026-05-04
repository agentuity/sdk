// @agentuity:imports
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { translate } from './translate';

const here = dirname(fileURLToPath(import.meta.url));
const landing = readFileSync(join(here, 'landing.html'), 'utf8');

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
	return c.html(landing);
});

export default app;
