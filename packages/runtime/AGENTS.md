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
- **Storage abstractions** - Provide kv, stream, vector interfaces

## Route Validation

Routes can use `agent.validator()` to automatically validate request input using the agent's schema:

```typescript
import { createRouter } from '@agentuity/runtime';
import myAgent from './my-agent';

const router = createRouter();

// Automatic validation using agent's input schema
router.post('/', myAgent.validator(), async (c) => {
	const data = c.req.valid('json'); // Fully typed from agent schema!
	const output = await myAgent.run(data);
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

export default createAgent('my-agent', {
	description: 'What this agent does',
	schema: {
		input: s.object({
			/* ... */
		}),
		output: s.object({
			/* ... */
		}),
	},
	handler: async (ctx, input) => {
		// ctx.logger, ctx.tracer, ctx.kv, ctx.app, etc.
		return output;
	},
});
```

**Note:** Internal metadata (id, agentId, filename, version) is automatically injected by the build system.

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
	stream: StreamStorage; // Stream storage
	vector: VectorStorage; // Vector storage
	state: Map<string, unknown>; // Request-scoped state
	thread: Thread; // Thread information
	session: Session; // Session information
	config: TConfig; // Agent-specific config from setup
	app: TAppState; // Application state from createApp
	waitUntil: (promise) => void; // Background tasks
}
```

## Observability

- **Logging**: Use `ctx.logger.info/warn/error()` not console.log
- **Tracing**: Create spans with `ctx.tracer.startSpan()`
- **Metrics**: Access via `c.var.meter` in Hono context
- **Environment**: Metrics/traces sent to OTLP endpoints

## Type Safety

**End-to-end type safety is a core feature of the runtime.** When you use `createAgent()` with schemas and `agent.validator()` in routes, TypeScript automatically infers correct types throughout your application.

### What IS Type-Safe ✅

1. **Route handler input types** - `c.req.valid('json')` is automatically typed from agent schema
2. **Agent handler types** - Both `ctx` and `input` parameters are fully typed
3. **Runtime validation** - Input/output validation happens automatically
4. **Schema overrides** - Custom schemas in `agent.validator({ input, output })` maintain type safety
5. **Multiple agents** - Each route maintains independent type safety

### Type Inference Best Practices

**CRITICAL:** Do NOT add type annotations to agent handler parameters - let TypeScript infer them:

```typescript
// ✅ CORRECT: Let TypeScript infer types from schema
const agent = createAgent('user', {
  schema: {
    input: z.object({ name: z.string(), age: z.number() }),
    output: z.object({ id: z.string() }),
  },
  handler: async (ctx, input) => {
    // ctx is typed as AgentContext
    // input is typed as { name: string, age: number }
    return { id: `user-${input.name}` };
  },
});

// ❌ WRONG: Explicit types defeat inference
handler: async (ctx: AgentContext, input: any) => { ... }
```

### Hono Method Chaining

For best type inference with Hono, use method chaining:

```typescript
// ✅ RECOMMENDED: Method chaining preserves types
const app = new Hono()
	.post('/users', userAgent.validator(), handler)
	.get('/users/:id', userAgent.validator({ output: UserSchema }), handler);
```

### Testing Type Safety

**IMPORTANT:** Due to Hono's `testClient()` type inference limitations with method-chained apps, use `app.request()` for testing:

```typescript
// ✅ CORRECT: Use app.request() for testing
test('creates user', async () => {
	const app = new Hono().post('/users', agent.validator(), async (c) => {
		const data = c.req.valid('json'); // Fully typed!
		return c.json({ id: `user-${data.name}` });
	});

	const res = await app.request('/users', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: 'Alice', age: 30 }),
	});

	expect(res.status).toBe(200);
	const result = await res.json();
	expect(result.id).toBe('user-Alice');
});

// ❌ AVOID: testClient has type inference issues
import { testClient } from 'hono/testing';
const client = testClient(app); // Returns unknown type
```

See `test/agent-type-safety.test.ts` for comprehensive type-safe testing examples.

For detailed type safety documentation, see `TYPE_SAFETY.md`.

## Testing

- **Test runner**: Use Bun's test runner: `bun test`
- **Test structure**: All tests in `test/` folder parallel to `src/`
- **Test imports**: Import from `../src/` not `../`
- **Mock contexts**: Use `TestAgentContext` from `test/helpers/test-context.ts`
- **Mock services**: Use mock storage interfaces (kv, stream, vector, etc.)
- **Route testing**: Use `app.request()` for testing routes (NOT `testClient()`)
- **Type verification**: Let TypeScript infer agent handler types - do NOT add type annotations

## Publishing Checklist

1. Run `bun run build` to compile for Bun runtime
2. Verify OpenTelemetry dependencies are correct versions
3. Test with real Hono server
4. Must publish **after** @agentuity/core
5. Ensure React is only in devDependencies (for type checking web components)
