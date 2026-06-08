# Explorer Demo Modules

This folder contains internal modules used by the SDK Explorer. They are not the public v3 app model.

## Rules

- Keep new public examples in framework routes, server functions, queue consumers, or plain shared functions.
- Do not import `@agentuity/runtime`.
- Do not use `createAgent()`, `createRouter()`, `createApp()`, or `createAgentContext()`.
- Existing Explorer modules can use `defineDemoAgent()` from `../agent/demo-agent` so older demo wiring can keep a small `.run()` surface without depending on the v2 runtime.
- Do not show `defineDemoAgent()` in public docs snippets. It is only for this docs app.
- Prefer direct service clients or `c.var.*` services from `@agentuity/hono` for real v3 examples.
- Keep helper modules small and reusable. If a route can call a plain function directly, prefer that over adding another demo module.

## Explorer Module Shape

```typescript
import { s } from '@agentuity/schema';
import { defineDemoAgent } from '../demo-agent';

const demo = defineDemoAgent('hello', {
	description: 'Simple greeting demo',
	schema: {
		input: s.object({ name: s.string() }),
		output: s.string(),
	},
	handler: async (ctx, { name }) => {
		ctx.logger.info('greeting requested', { name });
		return `Hello, ${name}`;
	},
});

export default demo;
```

## Public Pattern

When docs need to teach v3, show a framework route or plain function instead:

```typescript
import { Hono } from 'hono';
import * as v from 'valibot';

const app = new Hono();
const inputSchema = v.object({ name: v.string() });

app.post('/api/hello', async (c) => {
	const parsed = v.safeParse(inputSchema, await c.req.json());
	if (!parsed.success) return c.json({ error: 'name is required' }, 400);

	return c.text(`Hello, ${parsed.output.name}`);
});

export default app;
```
