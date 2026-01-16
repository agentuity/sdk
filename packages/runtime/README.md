# @agentuity/runtime

Server runtime for building Agentuity applications with Bun and Hono.

## Installation

```bash
bun add @agentuity/runtime
```

## Overview

`@agentuity/runtime` provides the server-side runtime for Agentuity applications. Built on [Hono](https://hono.dev/) and optimized for [Bun](https://bun.sh/), it enables you to create type-safe agents with automatic routing, validation, and observability.

## Quick Start

### Creating an Application

```typescript
import { createApp } from '@agentuity/runtime';

const { server, logger } = await createApp();

logger.info('Server running on %s', server.url);
```

### Defining an Agent

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('greeting', {
	description: 'A simple greeting agent',
	schema: {
		input: s.object({
			message: s.string(),
		}),
		output: s.object({
			response: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('Processing message:', input.message);
		return { response: `You said: ${input.message}` };
	},
});

export default agent;
```

### Creating Custom Routes

```typescript
import { createRouter } from '@agentuity/runtime';
import greetingAgent from './agent/greeting';

const router = createRouter();

router.get('/hello', (c) => {
	return c.json({ message: 'Hello, world!' });
});

// Route with agent validation
router.post('/greeting', greetingAgent.validator(), async (c) => {
	const data = c.req.valid('json'); // Fully typed from agent schema!
	const result = await greetingAgent.run(data);
	return c.json(result);
});

export default router;
```

### Streaming Responses

```typescript
import { createRouter, stream } from '@agentuity/runtime';

const router = createRouter();

router.post(
	'/events',
	stream((c) => {
		return new ReadableStream({
			start(controller) {
				controller.enqueue('Event 1\n');
				controller.enqueue('Event 2\n');
				controller.close();
			},
		});
	})
);
```

### WebSocket Support

```typescript
import { createRouter, websocket } from '@agentuity/runtime';

const router = createRouter();

router.get(
	'/chat',
	websocket((c, ws) => {
		ws.onOpen(() => {
			console.log('Client connected');
		});

		ws.onMessage((event) => {
			const data = JSON.parse(event.data);
			ws.send(JSON.stringify({ echo: data }));
		});

		ws.onClose(() => {
			console.log('Client disconnected');
		});
	})
);
```

### Server-Sent Events (SSE)

```typescript
import { createRouter, sse } from '@agentuity/runtime';

const router = createRouter();

router.get(
	'/updates',
	sse((c, stream) => {
		for (let i = 0; i < 10; i++) {
			stream.writeSSE({
				data: JSON.stringify({ count: i }),
				event: 'update',
			});
		}
	})
);
```

## API Reference

### createApp(config?)

Creates a new Agentuity application instance.

**Returns:**

- `router` - Hono application instance
- `server` - Server instance with `listen()` method
- `logger` - Structured logger

### createAgent(config)

Creates a type-safe agent with input/output validation.

**Config:**

- `schema.input?` - Schema for input validation (Zod, Valibot, etc.)
- `schema.output?` - Schema for output validation
- `handler` - Agent handler function `(ctx, input) => output`

### createRouter()

Creates a new router for defining custom API routes.

**Methods:**

- `get/post/put/delete/patch` - HTTP method handlers

**Middleware Functions:**

Use these middleware functions with standard HTTP methods:

- `websocket((c, ws) => { ... })` - WebSocket connections (use with `router.get()`)
- `sse((c, stream) => { ... })` - Server-Sent Events (use with `router.get()`)
- `stream((c) => ReadableStream)` - Streaming responses (use with `router.post()`)
- `cron(schedule, (c) => { ... })` - Scheduled tasks (use with `router.post()`)

### AgentContext

Context object available in agent handlers:

```typescript
interface AgentContext {
	logger: Logger; // Structured logger
	tracer: Tracer; // OpenTelemetry tracer
	sessionId: string; // Unique session ID
	kv: KeyValueStorage; // Key-value storage
	stream: StreamStorage; // Stream storage
	vector: VectorStorage; // Vector storage
	state: Map<string, unknown>; // Request-scoped state
	thread: Thread; // Thread information
	session: Session; // Session information
	config: TConfig; // Agent-specific config from setup
	app: TAppState; // Application state from createApp
	waitUntil: (promise) => void; // Defer cleanup tasks
}
```

## Storage Services

Agentuity provides built-in storage abstractions:

- **KeyValueStorage** - Simple key-value storage
- **StreamStorage** - Streaming data storage
- **VectorStorage** - Vector embeddings storage

Access these via the agent context:

```typescript
const agent = createAgent('storage-example', {
	schema: {
		output: s.object({ value: s.string().optional() }),
	},
	handler: async (ctx, input) => {
		await ctx.kv.set('key', 'value');
		const value = await ctx.kv.get('key');
		return { value };
	},
});
```

## Observability

Built-in OpenTelemetry support for logging, tracing, and metrics:

```typescript
const agent = createAgent('observability-example', {
	schema: {
		output: s.object({ success: s.boolean() }),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('Processing request');

		const span = ctx.tracer.startSpan('custom-operation');
		// ... do work ...
		span.end();

		return { success: true };
	},
});
```

## TypeScript

Fully typed with TypeScript. Input and output types are automatically inferred from your schemas.

## License

Apache 2.0
