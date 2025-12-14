---
name: agentuity-runtime
description: Skills for building Agentuity runtime applications - agents, routing, storage, sessions, evaluations, and observability
globs:
  - "**/agents/**/*.ts"
  - "**/app.ts"
  - "**/router.ts"
  - "**/*.agent.ts"
---

# Agentuity Runtime Skills

## Creating Runtime Apps with createApp

### When to Use
- Bootstrapping a new Agentuity application
- Configuring app-wide state, services, and lifecycle hooks
- Setting up shared resources like database connections

### Core API

```typescript
import { createApp, type AppConfig } from '@agentuity/runtime';

const app = await createApp({
  setup: async () => {
    const db = await connectDatabase();
    return { db };
  },
  shutdown: async (state) => {
    await state.db.close();
  },
  services: {
    useLocal: true,  // Use in-memory storage for development
  },
  cors: { origin: '*' }
});

// Access app properties
app.router;   // Hono router
app.server;   // Bun server
app.logger;   // Logger instance
app.state;    // State from setup()
```

### Key Patterns
- **Lifecycle hooks**: `setup()` runs before server starts, `shutdown()` on stop
- **App state**: Return object from `setup()` becomes `ctx.app` in all agents
- **Service overrides**: Use `services.useLocal: true` for local development
- **Event listeners**: `app.addEventListener('agent.started', handler)`

### Common Pitfalls
- Forgetting to await async operations in `setup()`
- Not closing connections in `shutdown()`
- Using `services.useLocal` in production

### Checklist
- [ ] Define `setup()` for shared resources
- [ ] Define `shutdown()` for cleanup
- [ ] Configure CORS if needed
- [ ] Set `useLocal: true` only in development

---

## Defining Agents with createAgent

### When to Use
- Creating request handlers with typed input/output
- Building agents that process data and return responses
- Setting up agent-specific initialization

### Core API

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('user-query', {
  description: 'Processes user queries',
  schema: {
    input: s.object({ query: s.string(), userId: s.string() }),
    output: s.object({ result: s.string() }),
    stream: false,
  },
  setup: async (appState) => {
    return { cache: new Map() };
  },
  shutdown: async (appState, config) => {
    config.cache.clear();
  },
  handler: async (ctx, input) => {
    ctx.logger.info('Processing query', { userId: input.userId });
    return { result: `Processed: ${input.query}` };
  },
});
```

### Key Patterns
- **Schema validation**: Input/output validated automatically
- **Agent config**: `setup()` returns agent-specific config available as `ctx.config`
- **Streaming**: Set `schema.stream: true` for streaming responses
- **Type inference**: Types flow from schema to handler parameters

### Common Pitfalls
- Adding explicit type annotations to handler params (defeats inference)
- Forgetting to export agent as default
- Not handling errors in handler

### Checklist
- [ ] Define input/output schemas with `@agentuity/schema`
- [ ] Let TypeScript infer handler parameter types
- [ ] Use `setup()` for agent-specific initialization
- [ ] Export agent as default

---

## Using AgentContext APIs

### When to Use
- Accessing runtime services within agent handlers
- Logging, tracing, storage operations
- Scheduling background tasks

### Core API

```typescript
handler: async (ctx, input) => {
  // Logging
  ctx.logger.info('Processing', { data: input });
  ctx.logger.warn('Rate limit approaching');
  ctx.logger.error('Operation failed', { error: err });

  // Tracing
  const span = ctx.tracer.startSpan('db-query');
  try {
    const result = await query();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } finally {
    span.end();
  }

  // Request-scoped state
  ctx.state.set('startTime', Date.now());
  const start = ctx.state.get('startTime') as number;

  // Background tasks
  ctx.waitUntil(async () => {
    await ctx.kv.set('processed', Date.now());
  });

  // Access app state and agent config
  await ctx.app.db.query('SELECT 1');
  ctx.config.cache.get('key');
}
```

### Key Patterns
- **ctx.logger**: Structured logging with OpenTelemetry correlation
- **ctx.tracer**: Create spans for performance tracking
- **ctx.state**: Request-scoped Map for passing data
- **ctx.waitUntil()**: Schedule tasks that run after response

### Common Pitfalls
- Using `console.log` instead of `ctx.logger`
- Forgetting to end tracer spans
- Blocking response on `waitUntil` tasks

### Checklist
- [ ] Use `ctx.logger` for all logging
- [ ] End all tracer spans in finally blocks
- [ ] Use `waitUntil` for non-blocking cleanup

---

## Routing Requests with Runtime Router

### When to Use
- Defining HTTP routes for agents
- Setting up WebSocket, SSE, or streaming endpoints
- Handling email, SMS, or cron triggers

### Core API

```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// Standard HTTP
router.get('/health', (c) => c.text('OK'));
router.post('/users', agent.validator(), async (c) => {
  const data = c.req.valid('json');  // Typed from agent schema
  return c.json({ id: '123', ...data });
});

// Streaming
router.stream('/events', (c) => {
  return new ReadableStream({
    start(controller) {
      controller.enqueue('data\n');
      controller.close();
    }
  });
});

// WebSocket
router.websocket('/ws', (c) => (ws) => {
  ws.onMessage((event) => ws.send('Echo: ' + event.data));
});

// Server-Sent Events
router.sse('/notifications', (c) => async (stream) => {
  await stream.writeSSE({ data: 'Hello', event: 'message' });
});

// Email handler
router.email('support@example.com', (email, c) => {
  console.log(email.fromEmail(), email.subject());
  return c.text('Received');
});

// Cron schedule
router.cron('0 0 * * *', (c) => c.text('Daily task'));
```

### Key Patterns
- **Validation**: Use `agent.validator()` for automatic input validation
- **Type safety**: `c.req.valid('json')` returns typed data
- **Special routes**: `email()`, `sms()`, `cron()` for non-HTTP triggers

### Common Pitfalls
- Using `testClient()` in tests (use `app.request()` instead)
- Forgetting middleware order matters
- Not handling WebSocket connection errors

### Checklist
- [ ] Use `agent.validator()` for POST/PUT/PATCH routes
- [ ] Test with `app.request()` not `testClient()`
- [ ] Handle errors in WebSocket handlers

---

## Using Runtime Storage APIs

### When to Use
- Persisting data with key-value storage
- Storing embeddings for vector search
- Streaming data to clients

### Core API

```typescript
handler: async (ctx, input) => {
  // Key-Value Storage
  await ctx.kv.set('user:123', { name: 'Alice', age: 30 });
  const user = await ctx.kv.get('user:123');
  await ctx.kv.delete('user:123');
  const keys = await ctx.kv.list('user:*');

  // Vector Storage
  await ctx.vector.upsert('docs', [
    { id: '1', values: [0.1, 0.2, 0.3], metadata: { text: 'Hello' } }
  ]);
  const results = await ctx.vector.query('docs', [0.1, 0.2, 0.3], { topK: 5 });

  // Stream Storage
  const stream = await ctx.stream.create('agent-logs');
  await ctx.stream.write(stream.id, 'Processing step 1');
  await ctx.stream.write(stream.id, 'Processing step 2');
}
```

### Key Patterns
- **KV prefixes**: Use `entity:id` pattern for organization
- **Vector metadata**: Store text alongside embeddings for retrieval
- **Stream IDs**: Create unique streams per operation

### Common Pitfalls
- Storing large objects in KV without compression
- Not handling storage errors gracefully
- Exceeding vector dimension limits

### Checklist
- [ ] Use consistent key naming conventions
- [ ] Handle storage operation failures
- [ ] Set appropriate TTLs for cached data

---

## Managing Sessions and Threads

### When to Use
- Maintaining conversation state across requests
- Tracking user sessions
- Persisting thread data between interactions

### Core API

```typescript
handler: async (ctx, input) => {
  // Thread (persists across sessions)
  ctx.logger.info('Thread: %s', ctx.thread.id);
  ctx.thread.state.set('messageCount',
    (ctx.thread.state.get('messageCount') as number || 0) + 1
  );

  ctx.thread.addEventListener('destroyed', (eventName, thread) => {
    ctx.logger.info('Thread destroyed: %s', thread.id);
  });

  // Session (per-request)
  ctx.logger.info('Session: %s', ctx.session.id);
  ctx.session.state.set('startTime', Date.now());

  ctx.session.addEventListener('completed', (eventName, session) => {
    ctx.logger.info('Session completed: %s', session.id);
  });

  // Access parent thread from session
  ctx.session.thread.state.set('lastAccess', Date.now());

  // Destroy thread manually
  await ctx.thread.destroy();
}
```

### Key Patterns
- **Thread state**: Persists across multiple requests (1-hour expiry default)
- **Session state**: Only exists for single request lifecycle
- **Events**: `thread.destroyed`, `session.completed`
- **Custom providers**: Implement `ThreadProvider` for Redis/database storage

### Common Pitfalls
- Storing sensitive data in thread state without encryption
- Not cleaning up thread listeners
- Assuming session state persists

### Checklist
- [ ] Use thread state for conversation history
- [ ] Use session state for request-scoped data
- [ ] Register cleanup in event listeners

---

## Working with Evaluations and Metrics

### When to Use
- Testing agent behavior with automated checks
- Scoring agent outputs
- Building CI/CD quality gates

### Core API

```typescript
import { createAgent } from '@agentuity/runtime';

const agent = createAgent('calculator', {
  schema: {
    input: s.object({ a: s.number(), b: s.number() }),
    output: s.number(),
  },
  handler: async (ctx, input) => input.a + input.b,
});

// Binary pass/fail evaluation
agent.createEval('positive-result', {
  description: 'Ensures result is positive',
  handler: async (ctx, input, output) => {
    if (output <= 0) {
      return { success: true, passed: false, metadata: { reason: 'Result not positive' } };
    }
    return { success: true, passed: true, metadata: { reason: 'Result is positive' } };
  },
});

// Scored evaluation (0-1 range)
agent.createEval('accuracy-check', {
  description: 'Checks calculation accuracy',
  handler: async (ctx, input, output) => {
    const expected = input.a + input.b;
    const score = output === expected ? 1.0 : 0.0;
    return { success: true, score, metadata: { reason: 'Accuracy check', expected, actual: output } };
  },
});
```

### Key Patterns
- **Binary results**: `{ success: true, passed: boolean, metadata }`
- **Scored results**: `{ success: true, score: 0-1, metadata }`
- **Error results**: `{ success: false, error: string }`
- **Metadata**: Always include `reason` in metadata

### Common Pitfalls
- Returning invalid score range (must be 0-1)
- Missing metadata.reason field
- Not handling evaluation errors

### Checklist
- [ ] Return valid result format
- [ ] Include descriptive metadata.reason
- [ ] Handle edge cases gracefully

---

## Handling Runtime Events and Logging

### When to Use
- Monitoring agent lifecycle
- Debugging with structured logs
- Correlating logs with traces

### Core API

```typescript
// App-level event listeners
app.addEventListener('agent.started', (eventName, agent, ctx) => {
  console.log(`Agent ${agent.metadata.name} started`);
});

app.addEventListener('agent.completed', (eventName, agent, ctx) => {
  console.log(`Agent ${agent.metadata.name} completed`);
});

app.addEventListener('agent.errored', (eventName, agent, ctx, error) => {
  console.error(`Agent ${agent.metadata.name} failed:`, error.message);
});

app.addEventListener('session.started', (eventName, session) => {
  console.log(`Session started: ${session.id}`);
});

// Structured logging in handlers
handler: async (ctx, input) => {
  ctx.logger.debug('Verbose debugging', { input });
  ctx.logger.info('Processing request', { userId: input.userId });
  ctx.logger.warn('Rate limit approaching', { remaining: 10 });
  ctx.logger.error('Operation failed', { error: err.message });

  // Child logger with context
  const logger = ctx.logger.child({ component: 'validator' });
  logger.info('Validating input');  // Includes component in all logs
}
```

### Key Patterns
- **Event types**: `agent.started`, `agent.completed`, `agent.errored`, `session.started`, `session.completed`, `thread.created`, `thread.destroyed`
- **Log levels**: `debug`, `info`, `warn`, `error`
- **Child loggers**: Add persistent context to logs
- **Correlation**: Logs automatically linked to traces

### Common Pitfalls
- Using console.log instead of ctx.logger
- Not removing event listeners (memory leak)
- Logging sensitive data

### Checklist
- [ ] Use ctx.logger for all application logs
- [ ] Register app-level listeners for monitoring
- [ ] Remove listeners when no longer needed
- [ ] Avoid logging PII or secrets

---

## References

- [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)
- [Agent Context API](https://preview.agentuity.dev/v1/Reference/sdk-reference#agentcontext)
- [Storage APIs](https://preview.agentuity.dev/v1/Reference/sdk-reference#storage)
