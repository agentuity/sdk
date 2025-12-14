---
name: agentuity-runtime
description: "Use when: creating agents with createAgent(), configuring apps with createApp(), accessing storage (ctx.kv, ctx.vector, ctx.stream), managing state (ctx.thread.state, ctx.session.state), handling routes, or working with events/lifecycle hooks."
globs:
  - "**/agents/**/*.ts"
  - "**/app.ts"
  - "**/api/**/*.ts"
  - "**/*.agent.ts"
---

# Agentuity Runtime

## Context Access

**In agents:** `ctx.logger`, `ctx.kv`, `ctx.thread`, `ctx.vector`, etc.

**In routes:** `c.var.logger`, `c.var.kv`, `c.var.thread`, or `c.get('logger')`.

---

## createApp

```typescript
import { createApp } from '@agentuity/runtime';

const app = await createApp({
  setup: async () => {
    const db = await connectDatabase();
    return { db };  // Available as ctx.app in agents
  },
  shutdown: async (state) => {
    await state.db.close();
  },
  services: { useLocal: true },  // Development only
  cors: { origin: '*' }
});

// App-level event listeners
app.addEventListener('agent.started', (_, agent, ctx) => {
  ctx.logger.info(`Agent ${agent.metadata.name} started`);
});
```

**Key points:**
- `setup()` runs before server starts; return object becomes `ctx.app` in all agents
- `shutdown()` runs on server stop for cleanup
- `useLocal: true` uses in-memory storage (development only)
- Events: `agent.started`, `agent.completed`, `agent.errored`, `session.started`, `session.completed`, `thread.created`, `thread.destroyed`

---

## createAgent

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('user-query', {
  description: 'Processes user queries',
  schema: {
    input: s.object({ query: s.string(), userId: s.string() }),
    output: s.object({ result: s.string() }),
  },
  setup: async (appState) => {
    return { cache: new Map() };  // Available as ctx.config
  },
  handler: async (ctx, input) => {
    ctx.logger.info('Processing', { userId: input.userId });
    return { result: `Processed: ${input.query}` };
  },
});
```

**Key points:**
- Let TypeScript infer handler types from schema (never add explicit type annotations)
- `setup()` returns agent-specific config → `ctx.config`
- App state → `ctx.app`
- Export agent as default

**Calling agents:**
```typescript
import summarizeAgent from './summarize.agent';
const result = await summarizeAgent.run({ text: 'content' });  // Type-safe
```

---

## AgentContext

```typescript
handler: async (ctx, input) => {
  // Logging
  ctx.logger.info('Processing', { data: input });
  
  // Tracing
  const span = ctx.tracer.startSpan('operation');
  try {
    // ... work
    span.setStatus({ code: SpanStatusCode.OK });
  } finally {
    span.end();
  }
  
  // Background tasks (non-blocking)
  ctx.waitUntil(async () => {
    await sendAnalytics(input);
  });
  
  // Access shared resources
  await ctx.app.db.query('SELECT 1');  // App state
  ctx.config.cache.get('key');         // Agent config
}
```

---

## State Management

| Scope | Lifetime | Access | Use Case |
|-------|----------|--------|----------|
| Request | Single request | `ctx.state` | Timing, temp data, event listener sharing |
| Thread | Up to 1 hour | `ctx.thread.state` | Conversation history, multi-request context |
| Session | Single request | `ctx.session.state` | Session completion callbacks only |

```typescript
handler: async (ctx, input) => {
  // Thread state (persists across requests, 1-hour expiry)
  const count = (ctx.thread.state.get('messageCount') as number || 0) + 1;
  ctx.thread.state.set('messageCount', count);
  
  // Request state (cleared after response)
  ctx.state.set('startTime', Date.now());
  
  // Thread lifecycle
  ctx.thread.addEventListener('destroyed', (_, thread) => {
    ctx.logger.info('Thread destroyed', { id: thread.id });
  });
  
  // Reset conversation
  await ctx.thread.destroy();
}
```

**State limits:** 1MB after JSON serialization. Store large data in KV, keep only recent messages.

---

## Storage

### Key-Value (namespace + key pattern)

```typescript
// Set with optional TTL
await ctx.kv.set('users', '123', { name: 'Alice' }, { ttl: 3600 });

// Get (always check .exists)
const result = await ctx.kv.get<User>('users', '123');
if (result.exists) {
  console.log(result.data.name);
}

// Delete and list
await ctx.kv.delete('users', '123');
const keys = await ctx.kv.keys('users');
```

### Vector (semantic search)

```typescript
// Upsert with auto-embedding
await ctx.vector.upsert('docs', {
  key: 'doc-1',
  document: 'Hello world',
  metadata: { topic: 'greeting' },
});

// Search
const results = await ctx.vector.search('docs', {
  query: 'greeting',
  limit: 5,
  similarity: 0.7,
});
```

### Durable Streams

```typescript
const stream = await ctx.stream.create('logs', { contentType: 'text/plain' });
await stream.write('Processing step 1\n');
await stream.close();
console.log(stream.url);  // Public URL
```

**Common mistakes:**
- Using `ctx.kv.get(key)` instead of `ctx.kv.get(namespace, key)`
- Not checking `result.exists` before accessing `result.data`
- Forgetting to close streams

---

## Routing

Routes live in `src/api/`. Access context via `c.var.*` or `c.get('*')`.

```typescript
import { createRouter } from '@agentuity/runtime';
import myAgent from '../agents/my.agent';

const router = createRouter();

// HTTP with validation
router.post('/users', myAgent.validator(), async (c) => {
  const data = c.req.valid('json');  // Typed from schema
  const result = await myAgent.run(data);
  return c.json(result);
});

// WebSocket
router.websocket('/ws', (c) => (ws) => {
  ws.onMessage((event) => ws.send('Echo: ' + event.data));
});

// SSE
router.sse('/events', (c) => async (stream) => {
  await stream.writeSSE({ data: 'Hello', event: 'message' });
});

// Cron, Email, SMS
router.cron('0 0 * * *', (c) => c.text('Daily task'));
router.email('support@example.com', (email, c) => c.text('Received'));
```

**Testing routes:** Use `app.request()`, not `testClient()`.

---

## Evaluations

```typescript
const agent = createAgent('calculator', {
  schema: { input: s.object({ a: s.number(), b: s.number() }), output: s.number() },
  handler: async (ctx, input) => input.a + input.b,
});

// Binary pass/fail
agent.createEval('positive-result', {
  description: 'Result must be positive',
  handler: async (ctx, input, output) => {
    return output > 0
      ? { success: true, passed: true, metadata: { reason: 'Positive' } }
      : { success: true, passed: false, metadata: { reason: 'Not positive' } };
  },
});

// Scored (0-1)
agent.createEval('accuracy', {
  handler: async (ctx, input, output) => ({
    success: true,
    score: output === input.a + input.b ? 1.0 : 0.0,
    metadata: { reason: 'Accuracy check' },
  }),
});
```

---

## Events

```typescript
// Agent-level (in agent definition)
const agent = createAgent('my-agent', {
  handler: async (ctx, input) => { /* ... */ },
});

agent.addEventListener('started', (_, agent, ctx) => {});
agent.addEventListener('completed', (_, agent, ctx) => {});
agent.addEventListener('errored', (_, agent, ctx, error) => {});

// App-level (in app.ts)
app.addEventListener('agent.started', (_, agent, ctx) => {});
app.addEventListener('session.started', (_, session) => {});
app.addEventListener('thread.created', (_, thread) => {});
```

---

## Reference

- [Creating Agents](https://preview.agentuity.dev/v1/Build/Agents/creating-agents)
- [State Management](https://preview.agentuity.dev/v1/Build/Agents/state-management)
- [Storage APIs](https://preview.agentuity.dev/v1/Build/Storage/key-value)
- [Routing](https://preview.agentuity.dev/v1/Build/Routes)
