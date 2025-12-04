# Agent Guidelines for @agentuity/runtime

## Package Overview

Server runtime for building Agentuity applications. Built on Hono framework and optimized for Bun runtime with OpenTelemetry observability.

## Commands

- **Build**: `bun run build` (compiles for Bun target)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `bun run clean` (removes dist/)

## Architecture

- **Runtime**: Bun server runtime
- **Framework**: Hono (lightweight web framework)
- **Build target**: Bun runtime
- **Dependencies**: `@agentuity/core`, Hono, OpenTelemetry
- **Observability**: Built-in OpenTelemetry for logs, traces, and metrics

## Structure

```
src/
├── index.ts        # Main exports
├── app.ts          # createApp() function
├── agent.ts        # Agent types and createAgent()
├── router.ts       # createRouter() with extended methods
├── logger.ts       # Logging utilities
├── _server.ts      # Internal server creation
├── _context.ts     # Internal context management
└── _util.ts        # Internal utilities
```

## Code Style

- **Hono patterns** - Follow Hono's context-based API design
- **Type safety** - Extensive use of TypeScript generics
- **Middleware pattern** - Support Hono middleware
- **Async handlers** - All handlers can be async
- **OpenTelemetry** - Use tracer/logger from context

## Important Conventions

- **Agent context** - Every agent handler receives `AgentContext` as first parameter
- **Schema validation** - Support StandardSchemaV1 (works with Zod, Valibot, etc.)
- **Route validation** - Use `agent.validator()` for automatic input validation with full type safety
- **Streaming support** - Agents can return ReadableStream for streaming responses
- **WebSocket support** - Use `router.websocket()` for WebSocket routes
- **SSE support** - Use `router.sse()` for Server-Sent Events
- **Session tracking** - Each request gets unique sessionId
- **Storage abstractions** - Provide kv, objectstore, stream, vector interfaces

## Route Validation

Routes can use `agent.validator()` to automatically validate request input using the agent's schema:

```typescript
import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

// Automatic validation using agent's input schema
router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json'); // Fully typed from agent schema!
	const output = await c.agent.myAgent.run(data);
	return c.json(output);
});

// Override with custom schema
router.post(
	'/custom',
	agent.validator({
		input: z.object({ custom: z.string() }),
	}),
	async (c) => {
		const data = c.req.valid('json'); // Typed as { custom: string }
		return c.json(data);
	}
);

// GET routes don't need validation
router.get('/', async (c) => {
	return c.json({ hello: 'world' });
});
```

The validator supports three overload signatures:

- `agent.validator()` - Uses agent's input/output schemas
- `agent.validator({ output: schema })` - Output-only validation (GET-compatible)
- `agent.validator({ input: schema, output?: schema })` - Custom input/output schemas

## Agent Definition Pattern

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent({
	metadata: {
		id: 'unique-id',
		identifier: 'folder-name',
		name: 'Human Name',
		description: 'What it does',
		filename: __filename,
		version: 'hash-or-version',
	},
	schema: {
		input: s.object({
			/* ... */
		}),
		output: s.object({
			/* ... */
		}),
	},
	handler: async (ctx, input) => {
		// ctx.logger, ctx.tracer, ctx.kv, etc.
		return output;
	},
});
```

## Router Extensions

The `createRouter()` function returns an extended Hono instance with:

- **Standard HTTP methods**: `get`, `post`, `put`, `delete`, `patch`
- **Streaming**: `stream(path, handler)` - Returns ReadableStream
- **WebSocket**: `websocket(path, handler)` - WebSocket connections
- **SSE**: `sse(path, handler)` - Server-Sent Events

## AgentContext API

Every agent handler receives:

```typescript
interface AgentContext {
	logger: Logger; // Structured logger
	tracer: Tracer; // OpenTelemetry tracer
	sessionId: string; // Unique session ID
	kv: KeyValueStorage; // Key-value storage
	objectstore: ObjectStorage; // Object storage
	stream: StreamStorage; // Stream storage
	vector: VectorStorage; // Vector storage
	agent: AgentRegistry; // Access other agents
	waitUntil: (promise) => void; // Background tasks
}
```

## Observability

- **Logging**: Use `ctx.logger.info/warn/error()` not console.log
- **Tracing**: Create spans with `ctx.tracer.startSpan()`
- **Metrics**: Access via `c.var.meter` in Hono context
- **Environment**: Metrics/traces sent to OTLP endpoints

## Testing

- Use Bun's test runner: `bun test`
- Mock storage interfaces (kv, objectstore, etc.)
- Test agent handlers with mock context
- Use Hono's testing utilities for routes

## Publishing Checklist

1. Run `bun run build` to compile for Bun runtime
2. Verify OpenTelemetry dependencies are correct versions
3. Test with real Hono server
4. Must publish **after** @agentuity/core
5. Ensure React is only in devDependencies (for type checking web components)
