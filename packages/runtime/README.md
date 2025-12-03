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

const { app, server, logger } = createApp();

// Start the server
server.listen(3500);
logger.info('Server running on http://localhost:3500');
```

### Defining an Agent

```typescript
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.object({
			message: z.string(),
		}),
		output: z.object({
			response: z.string(),
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

const router = createRouter();

router.get('/hello', (c) => {
	return c.json({ message: 'Hello, world!' });
});

router.post('/data', async (c) => {
	const body = await c.req.json();
	return c.json({ received: body });
});

export default router;
```

### Streaming Responses

```typescript
router.stream('/events', async (c) => {
	return new ReadableStream({
		start(controller) {
			controller.enqueue('Event 1\n');
			controller.enqueue('Event 2\n');
			controller.close();
		},
	});
});
```

### WebSocket Support

```typescript
router.websocket('/chat', (c) => (ws) => {
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
});
```

### Server-Sent Events (SSE)

```typescript
router.sse('/updates', (c) => async (stream) => {
	for (let i = 0; i < 10; i++) {
		await stream.writeSSE({
			data: JSON.stringify({ count: i }),
			event: 'update',
		});
		await stream.sleep(1000);
	}
});
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
- `handler` - Agent handler function `(ctx: AgentContext, input) => output`

### createRouter()

Creates a new router for defining custom API routes.

**Methods:**

- `get/post/put/delete/patch` - HTTP method handlers
- `stream(path, handler)` - Streaming response handler
- `websocket(path, handler)` - WebSocket handler
- `sse(path, handler)` - Server-Sent Events handler

### AgentContext

Context object available in agent handlers:

```typescript
interface AgentContext {
	logger: Logger; // Structured logger
	tracer: Tracer; // OpenTelemetry tracer
	sessionId: string; // Unique session ID
	kv: KeyValueStorage; // Key-value storage
	objectstore: ObjectStorage; // Object storage
	stream: StreamStorage; // Stream storage
	vector: VectorStorage; // Vector storage
	agent: AgentRegistry; // Access to other agents
	waitUntil: (promise) => void; // Defer cleanup tasks
}
```

## Storage Services

Agentuity provides built-in storage abstractions:

- **KeyValueStorage** - Simple key-value storage
- **ObjectStorage** - Object/blob storage
- **StreamStorage** - Streaming data storage
- **VectorStorage** - Vector embeddings storage

Access these via the agent context:

```typescript
const agent = createAgent({
	schema: {
		output: z.object({ value: z.string().optional() }),
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
const agent = createAgent({
	schema: {
		output: z.object({ success: z.boolean() }),
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
