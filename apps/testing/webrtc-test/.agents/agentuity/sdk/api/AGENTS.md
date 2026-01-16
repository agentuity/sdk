# APIs Folder Guide

This folder contains REST API routes for your Agentuity application. Each API is organized in its own subdirectory.

## Generated Types

The `src/generated/` folder contains auto-generated TypeScript files:

- `routes.ts` - Route registry with strongly-typed route definitions and schema types
- `registry.ts` - Agent registry (for calling agents from routes)
- `app.ts` - Application entry point (regenerated on every build)

**Important:** Never edit files in `src/generated/` - they are overwritten on every build.

Import generated types in your routes:

```typescript
import type { POST_Api_UsersInput, POST_Api_UsersOutput } from '../generated/routes';
```

## Directory Structure

Each API folder must contain:

- **route.ts** (required) - HTTP route definitions using Hono router

Example structure:

```
src/api/
├── index.ts         (optional, mounted at /api)
├── status/
│   └── route.ts     (mounted at /api/status)
├── users/
│   └── route.ts     (mounted at /api/users)
├── agent-call/
    └── route.ts     (mounted at /api/agent-call)
```

## Creating an API

### Basic API (route.ts)

```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// GET /api/status
router.get('/', (c) => {
	return c.json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		version: '1.0.0',
	});
});

// POST /api/status
router.post('/', async (c) => {
	const body = await c.req.json();
	return c.json({ received: body });
});

export default router;
```

### API with Request Validation

```typescript
import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { validator } from 'hono/validator';

const router = createRouter();

const createUserSchema = s.object({
	name: s.string(),
	email: s.string(),
	age: s.number(),
});

router.post(
	'/',
	validator('json', (value, c) => {
		const result = createUserSchema['~standard'].validate(value);
		if (result.issues) {
			return c.json({ error: 'Validation failed', issues: result.issues }, 400);
		}
		return result.value;
	}),
	async (c) => {
		const data = c.req.valid('json');
		// data is fully typed: { name: string, email: string, age: number }
		return c.json({
			success: true,
			user: data,
		});
	}
);

export default router;
```

### API Calling Agents

APIs can call agents directly by importing them:

```typescript
import { createRouter } from '@agentuity/runtime';
import helloAgent from '@agent/hello';

const router = createRouter();

router.get('/', async (c) => {
	// Call an agent directly
	const result = await helloAgent.run({ name: 'API Caller', age: 42 });

	return c.json({
		success: true,
		agentResult: result,
	});
});

router.post('/with-input', async (c) => {
	const body = await c.req.json();
	const { name, age } = body;

	// Call agent with dynamic input
	const result = await helloAgent.run({ name, age });

	return c.json({
		success: true,
		agentResult: result,
	});
});

export default router;
```

### API with Agent Validation

Use `agent.validator()` for automatic input validation from agent schemas:

```typescript
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/my-agent';

const router = createRouter();

// POST with automatic validation using agent's input schema
router.post('/', myAgent.validator(), async (c) => {
	const data = c.req.valid('json'); // Fully typed from agent schema!
	const result = await myAgent.run(data);
	return c.json({ success: true, result });
});

export default router;
```

### API with Logging

```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/log-test', (c) => {
	c.var.logger.info('Info message');
	c.var.logger.error('Error message');
	c.var.logger.warn('Warning message');
	c.var.logger.debug('Debug message');
	c.var.logger.trace('Trace message');

	return c.text('Check logs');
});

export default router;
```

## Route Context (c)

The route handler receives a Hono context object with:

- **c.req** - Request object (c.req.json(), c.req.param(), c.req.query(), etc.)
- **c.json()** - Return JSON response
- **c.text()** - Return text response
- **c.html()** - Return HTML response
- **c.redirect()** - Redirect to URL
- **c.var.logger** - Structured logger (info, warn, error, debug, trace)
- **c.var.kv** - Key-value storage
- **c.var.vector** - Vector storage
- **c.var.stream** - Stream management
- **Import agents directly** - Import and call agents directly (recommended)

## HTTP Methods

```typescript
const router = createRouter();

router.get('/path', (c) => {
	/* ... */
});
router.post('/path', (c) => {
	/* ... */
});
router.put('/path', (c) => {
	/* ... */
});
router.patch('/path', (c) => {
	/* ... */
});
router.delete('/path', (c) => {
	/* ... */
});
router.options('/path', (c) => {
	/* ... */
});
```

## Path Parameters

```typescript
// GET /api/users/:id
router.get('/:id', (c) => {
	const id = c.req.param('id');
	return c.json({ userId: id });
});

// GET /api/posts/:postId/comments/:commentId
router.get('/:postId/comments/:commentId', (c) => {
	const postId = c.req.param('postId');
	const commentId = c.req.param('commentId');
	return c.json({ postId, commentId });
});
```

## Query Parameters

```typescript
// GET /api/search?q=hello&limit=10
router.get('/search', (c) => {
	const query = c.req.query('q');
	const limit = c.req.query('limit') || '20';
	return c.json({ query, limit: parseInt(limit) });
});
```

## Request Body

```typescript
// JSON body
router.post('/', async (c) => {
	const body = await c.req.json();
	return c.json({ received: body });
});

// Form data
router.post('/upload', async (c) => {
	const formData = await c.req.formData();
	const file = formData.get('file');
	return c.json({ fileName: file?.name });
});
```

## Error Handling

```typescript
import myAgent from '@agent/my-agent';

router.get('/', async (c) => {
	try {
		const result = await myAgent.run({ data: 'test' });
		return c.json({ success: true, result });
	} catch (error) {
		c.var.logger.error('Agent call failed:', error);
		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});
```

## Response Types

```typescript
// JSON response
return c.json({ data: 'value' });

// Text response
return c.text('Hello World');

// HTML response
return c.html('<h1>Hello</h1>');

// Custom status code
return c.json({ error: 'Not found' }, 404);

// Redirect
return c.redirect('/new-path');

// Headers
return c.json({ data: 'value' }, 200, {
	'X-Custom-Header': 'value',
});
```

## Streaming Routes

```typescript
import { createRouter, stream, sse, websocket } from '@agentuity/runtime';

const router = createRouter();

// Stream response (use with POST)
router.post(
	'/events',
	stream((c) => {
		return new ReadableStream({
			start(controller) {
				controller.enqueue('event 1\n');
				controller.enqueue('event 2\n');
				controller.close();
			},
		});
	})
);

// Server-Sent Events (use with GET)
router.get(
	'/notifications',
	sse((c, stream) => {
		stream.writeSSE({ data: 'Hello', event: 'message' });
		stream.writeSSE({ data: 'World', event: 'message' });
	})
);

// WebSocket (use with GET)
router.get(
	'/ws',
	websocket((c, ws) => {
		ws.onOpen(() => {
			ws.send('Connected!');
		});
		ws.onMessage((event) => {
			ws.send(`Echo: ${event.data}`);
		});
	})
);

export default router;
```

## Rules

- Each API folder name becomes the route name (e.g., `status/` → `/api/status`)
- **route.ts** must export default the router instance
- Use c.var.logger for logging, not console.log
- Import agents directly to call them (e.g., `import agent from '@agent/name'`)
- Validation should use @agentuity/schema or agent.validator() for type safety
- Return appropriate HTTP status codes
- APIs run at `/api/{folderName}` by default

<!-- prompt_hash: a79b3f50bbc54be2f21c3fd4a20f1683c4c51b0713844e2efc1d4b40a7e70c5d -->
