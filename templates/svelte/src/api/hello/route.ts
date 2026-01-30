import { Hono } from 'hono';
import { z } from 'zod';
import { validator } from '@agentuity/runtime';

const app = new Hono();

const inputSchema = z.object({
	name: z.string(),
});

const outputSchema = z.object({
	greeting: z.string(),
});

app.post('/', validator('json', inputSchema, outputSchema), async (c) => {
	const { name } = c.req.valid('json');
	return c.json({
		greeting: `Hello, ${name}! Welcome to Agentuity with Svelte.`,
	});
});

export default app;
