# APIs Folder Guide

This folder contains REST API routes for your Agentuity application. Each API is organized in its own subdirectory.

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

const router = createRouter();

const createUserSchema = s.object({
	name: s.string(),
	email: s.string(),
	age: s.number(),
});

const validator = createRouter.validator({
	input: createUserSchema,
});

router.post('/', validator, async (c) => {
	const data = c.req.valid('json');
	// data is fully typed: { name: string, email: string, age: number }
	return c.json({ 
		success: true, 
		user: data 
	});
});

export default router;
```

### API Calling Agents

APIs can call agents directly:

```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	// Call an agent from the agents/ folder
	const result = await c.agent.hello.run({ name: 'API Caller', age: 42 });
	
	return c.json({
		success: true,
		agentResult: result,
	});
});

router.post('/with-input', async (c) => {
	const body = await c.req.json();
	const { name, age } = body;
	
	// Call agent with dynamic input
	const result = await c.agent.simple.run({ name, age });
	
	return c.json({
		success: true,
		agentResult: result,
	});
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
- **Import agents directly** - Import and call agents directly instead of using c.var.agent
- **c.var.kv** - Key-value storage
- **c.var.vector** - Vector storage
- **c.var.stream** - Stream management

## HTTP Methods

```typescript
const router = createRouter();

router.get('/path', (c) => { /* ... */ });
router.post('/path', (c) => { /* ... */ });
router.put('/path', (c) => { /* ... */ });
router.patch('/path', (c) => { /* ... */ });
router.delete('/path', (c) => { /* ... */ });
router.options('/path', (c) => { /* ... */ });
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
router.get('/', async (c) => {
	try {
		const result = await c.agent.myAgent.run({ data: 'test' });
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

## Rules

- Each API folder name becomes the route name (e.g., `status/` → `/api/status`)
- **route.ts** must export default the router instance
- Use c.var.logger for logging, not console.log
- All agents are accessible via c.agent.{agentName}
- Validation should use @agentuity/schema or any Standard Schema compatible library
- Return appropriate HTTP status codes
- APIs run at `/api/{folderName}` by default
