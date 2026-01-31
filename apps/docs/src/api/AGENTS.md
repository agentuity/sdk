# APIs Folder Guide

This folder contains REST API routes for your Agentuity application. Each API is organized in its own subdirectory.

## Directory Structure

Each API folder must contain:

- **route.ts** (required) - HTTP route definitions using Hono router

Current routes in this SDK Explorer:

```text
src/api/
├── index.ts             # Empty router (mounted at /api)
├── hello/               # Basic greeting endpoint
├── chat/                # Chat conversation endpoint
├── context/             # AgentContext info endpoint
├── key-value/           # KV storage operations
├── vector-storage/      # Vector search endpoint
├── object-storage/      # S3 file operations
├── ai-gateway/          # Multi-provider LLM routing (streaming)
├── streaming/           # Raw text streaming
├── sse-stream/          # Server-Sent Events streaming
├── durable-stream/      # Persistent streams with public URLs
├── agent-calls/         # Agent invocation patterns (sync/background/chain)
├── model-arena/         # LLM-as-judge comparison (SSE)
├── evals/               # Quality evaluations endpoint
├── websocket/           # WebSocket bidirectional communication
└── sandbox/             # Cloud sandbox execution (SSE)
    ├── route.ts         # Sandbox execution endpoint
    └── scripts.ts       # Script names and default inputs (generated)
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
		user: data,
	});
});

export default router;
```

### API Calling Agents

Import agents directly and call `.run()`:

```typescript
import { createRouter } from '@agentuity/runtime';
import helloAgent from '../../agent/hello/agent';

const router = createRouter();

router.get('/', async (c) => {
	// Call the imported agent directly
	const result = await helloAgent.run({ name: 'API Caller' });

	return c.json({
		success: true,
		agentResult: result,
	});
});

// Use agent.validator() for automatic request validation
router.post('/', helloAgent.validator(), async (c) => {
	const data = c.req.valid('json'); // Already typed & validated
	const result = await helloAgent.run(data);

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
import myAgent from '../../agent/my-agent/agent';

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

## SSE Streaming (Server-Sent Events)

Use the `sse()` middleware for streaming responses with named events:

```typescript
import { createRouter, sse } from '@agentuity/runtime';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const router = createRouter();

router.get('/stream', (c) =>
	sse(async (c, stream) => {
		const { textStream } = streamText({
			model: openai('gpt-5-nano'),
			prompt: 'Tell me a story',
		});

		let chunkCount = 0;
		for await (const chunk of textStream) {
			await stream.writeSSE({
				event: 'token',
				data: chunk,
				id: String(chunkCount++),
			});
		}

		await stream.writeSSE({
			event: 'done',
			data: JSON.stringify({ totalTokens: chunkCount }),
		});
	})
);

export default router;
```

**SSE Event Structure:**

- `event` - Event name (client listens with `eventSource.addEventListener(event, ...)`)
- `data` - Event payload (string)
- `id` - Optional event ID for client-side deduplication

**Used in:** `sse-stream/`, `model-arena/`, `sandbox/`

## Raw Streaming

Use the `stream()` middleware for simple text streaming without events:

```typescript
import { createRouter, stream } from '@agentuity/runtime';
import { streamText } from 'ai';

const router = createRouter();

router.post('/stream', (c) =>
	stream(async () => {
		const { textStream } = streamText({
			model: openai('gpt-5-nano'),
			prompt: 'Hello',
		});
		return textStream; // Returns ReadableStream directly
	})
);

export default router;
```

**Used in:** `streaming/`, `ai-gateway/`

## WebSocket

Use the `websocket()` middleware for bidirectional communication:

```typescript
import { createRouter, websocket } from '@agentuity/runtime';

const router = createRouter();

router.get('/connect', (c) =>
	websocket((c, ws) => {
		ws.onOpen(() => {
			ws.send(JSON.stringify({ type: 'system', message: 'Connected' }));
		});

		ws.onMessage(async (event) => {
			const data = typeof event.data === 'string' ? event.data : '';
			ws.send(JSON.stringify({ type: 'echo', message: data }));
		});

		ws.onClose(() => {
			console.log('Client disconnected');
		});
	})
);

export default router;
```

**Used in:** `websocket/`

## Background Tasks

Use `c.waitUntil()` to schedule work after the response is sent:

```typescript
router.post('/background', async (c) => {
	const body = await c.req.json();

	// Schedule background work
	c.waitUntil(async () => {
		// This runs after the response is sent
		await someAsyncTask(body);
	});

	// Return immediately
	return c.json({ status: 'accepted' });
});
```

**Used in:** `agent-calls/`, `context/`, `durable-stream/`

## Sandbox Route (sandbox/)

The sandbox route executes demo scripts in cloud sandboxes with session reuse.

**Endpoint:** `GET /api/sandbox/run?script=hello&input=base64JSON`

**Session Reuse Flow:**

1. Read `atid` cookie → thread ID
2. KV lookup `explorer-sessions` / threadId → sandboxId
3. If found: Execute on existing sandbox via `sandboxExecute()`
4. If not found or expired: Create new sandbox with `mode: 'interactive'`
5. Store sandboxId in KV with 10-min TTL
6. Fetch stdout + stderr after execution completes
7. Fallback: If any step fails, use one-shot `sandboxRun()`

**Files:**

- `route.ts` - SSE endpoint with interactive session logic
- `scripts.ts` - Script names (`SCRIPT_NAMES`) and default inputs (`SCRIPT_DEFAULTS`), generated by `bun run generate:scripts`

**SSE Events:**

- `status` - Sandbox status ('creating', 'running')
- `stdout` - Output content (combined stdout + stderr)
- `done` - Completion with `{ exitCode: number }`
- `error` - Error message

**Key Implementation Details:**

- Sandbox created without initial command (stays in `idle` state)
- 10-min idle timeout matches KV TTL
- Both stdout and stderr fetched (logger writes to stderr)
- No live streaming in interactive mode (output fetched after completion)

**Adding a new sandbox script:**

1. Create the script in `src/run/newscript.ts`
2. Run `bun run generate:scripts` to regenerate script metadata
3. Rebuild the sandbox snapshot to include the new script
4. The script should output results wrapped in `---OUTPUT---` markers

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
- Use `c.var.logger` for logging in routes (or `ctx.logger` in agents), not console.log
- Import agents directly: `import agent from '../../agent/name/agent'`
- Call agents with `agent.run(input)` or use `agent.validator()` middleware
- Validation should use @agentuity/schema or any Standard Schema compatible library
- Return appropriate HTTP status codes
- APIs run at `/api/{folderName}` by default
