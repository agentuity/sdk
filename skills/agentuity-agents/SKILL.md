---
name: agentuity-agents
description: Building agents with the Agentuity Runtime SDK. Use when creating, configuring, or debugging agents using createAgent, defining schemas with @agentuity/schema, working with AgentContext (ctx) APIs like logger, kv, vector, stream, thread, session, state, or auth, calling agents from other agents, streaming responses, running background tasks with waitUntil, or writing agent evaluations. Triggers on any Agentuity agent development task.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Agents

Build agents with the Agentuity Runtime SDK (`@agentuity/runtime`). Agents are the core building block — each one is a self-contained handler with typed input/output, access to platform services, and the ability to call other agents.

## Creating an Agent

Every agent is defined with `createAgent`:

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('my-agent', {
  description: 'What this agent does',
  schema: {
    input: s.object({ message: s.string() }),
    output: s.object({ reply: s.string() }),
  },
  handler: async (ctx, input) => {
    ctx.logger.info('Received', { message: input.message });
    return { reply: `Hello: ${input.message}` };
  },
});
```

**Important:** Do NOT add type annotations to `handler` parameters — let TypeScript infer them from the schema. Writing `async (ctx: AgentContext, input: MyInput)` breaks inference.

### File Structure

Each agent lives in its own directory under `src/agent/`:

```
src/agent/
├── translate/
│   └── index.ts      # export default createAgent(...)
├── summarize/
│   └── index.ts
```

The agent name in `createAgent('translate', ...)` determines its URL path: `POST /agent/translate`.

## Schema Validation

Use `@agentuity/schema` (lightweight, built-in) or Zod — both implement StandardSchemaV1.

```typescript
import { s } from '@agentuity/schema';

// Primitives
s.string()
s.number()
s.boolean()
s.any()

// Objects
s.object({
  name: s.string(),
  age: s.number().optional(),
  role: s.enum(['admin', 'user', 'guest']),
  tags: s.array(s.string()),
  metadata: s.object({ key: s.string() }).optional(),
})

// Coercion (converts input types)
s.coerce.string()   // "123" or 123 → "123"
s.coerce.number()   // "42" → 42
s.coerce.boolean()  // "true" → true
s.coerce.date()     // "2026-01-01" → Date

// Type inference
type User = s.infer<typeof userSchema>;
```

**When to use Zod instead:** Complex validation (.email(), .url(), .min(), .max()), or when the user's codebase already uses Zod. Both work with agent schemas.

## AgentContext (ctx)

The `ctx` object gives every agent access to platform services:

| Property | Purpose |
|---|---|
| `ctx.logger` | Structured logging (trace/debug/info/warn/error/fatal) |
| `ctx.tracer` | OpenTelemetry tracing |
| `ctx.kv` | Key-value storage (persistent) |
| `ctx.vector` | Semantic search with embeddings |
| `ctx.stream` | Stream storage |
| `ctx.sandbox` | Isolated code execution |
| `ctx.auth` | User authentication (if configured) |
| `ctx.thread` | Conversation context (persists across requests) |
| `ctx.session` | Request-scoped context |
| `ctx.state` | Request-scoped Map (sync, cleared after handler) |
| `ctx.config` | Agent-specific config from setup() |
| `ctx.app` | App-level state from createApp setup() |
| `ctx.current` | Agent metadata (name, agentId, version) |
| `ctx.sessionId` | Unique request ID |
| `ctx.waitUntil()` | Schedule background work after response |

### Logging

```typescript
ctx.logger.info('Processing request', { userId: 123 });
ctx.logger.debug('Debug details');
ctx.logger.error('Something failed', { error: err.message });
```

Always use `ctx.logger` instead of `console.log` — it's structured, observable, and shows in the Agentuity console.

## State Management

Three layers of state, each with different lifetimes:

```typescript
handler: async (ctx, input) => {
  // Thread state — persists across requests in the same conversation (async)
  const history = (await ctx.thread.state.get<Message[]>('messages')) ?? [];
  history.push({ role: 'user', content: input.message });
  await ctx.thread.state.set('messages', history);

  // Push to array with sliding window (keeps last N items)
  await ctx.thread.state.push('recentMessages', newMsg, 10);

  // Session state — persists for the request duration (sync)
  ctx.session.state.set('lastInput', input.message);
  const last = ctx.session.state.get('lastInput');

  // Request state — cleared after handler completes (sync)
  ctx.state.set('startTime', Date.now());
}
```

## Key-Value Storage

Persistent storage across threads and projects:

```typescript
// Set a value (with optional TTL in seconds)
await ctx.kv.set('namespace', 'key', { data: 'value' });
await ctx.kv.set('cache', 'user:123', userData, { ttl: 3600 });

// Get a value
const result = await ctx.kv.get<UserData>('namespace', 'key');
if (result.exists) {
  console.log(result.data);
}

// Delete
await ctx.kv.delete('namespace', 'key');
```

## Vector Storage

Semantic search with automatic embeddings:

```typescript
// Store a document (embeddings generated automatically)
await ctx.vector.upsert('docs', {
  key: 'doc-1',
  document: 'The quick brown fox...',
  metadata: { category: 'example' },
});

// Semantic search
const results = await ctx.vector.search('docs', 'fast animal', { limit: 5 });
for (const result of results) {
  console.log(result.key, result.score, result.document);
}
```

## Calling Other Agents

Import the agent module and call `.run()`:

```typescript
import otherAgent from '@agent/other-agent';

handler: async (ctx, input) => {
  // Type-safe call — input/output types inferred from the other agent's schema
  const result = await otherAgent.run({ query: input.text });
  return { data: result };
}
```

The `@agent/` import alias is set up automatically by the build system.

## Streaming Responses

Enable streaming for real-time output:

```typescript
import { createAgent } from '@agentuity/runtime';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export default createAgent('chat', {
  schema: {
    input: s.object({ message: s.string() }),
    stream: true,  // Enable streaming
  },
  handler: async (ctx, input) => {
    const { textStream } = streamText({
      model: openai('gpt-4o'),
      prompt: input.message,
    });
    return textStream;
  },
});
```

## Background Tasks

Schedule work that runs after the response is sent:

```typescript
handler: async (ctx, input) => {
  // This runs in the background — doesn't block the response
  ctx.waitUntil(async () => {
    await ctx.vector.upsert('docs', {
      key: input.docId,
      document: input.content,
    });
  });

  return { status: 'Queued for indexing' };
}
```

## App Setup and Shared State

Use `createApp` in `app.ts` to initialize shared resources:

```typescript
import { createApp } from '@agentuity/runtime';

const { server, logger } = await createApp({
  setup: async () => {
    const db = await connectDatabase();
    return { db };  // Available as ctx.app.db in all agents
  },
  shutdown: async (state) => {
    await state.db.close();
  },
});
```

Agents access shared state via `ctx.app`:

```typescript
handler: async (ctx, input) => {
  const users = await ctx.app.db.query('SELECT * FROM users');
  return { users };
}
```

## Agent Lifecycle Hooks

Agents support optional `setup` and `shutdown` hooks:

```typescript
export default createAgent('cached-agent', {
  schema: { ... },
  setup: async (app) => {
    const cache = new Map();
    return { cache };  // Available via ctx.config
  },
  shutdown: async (app, config) => {
    config.cache.clear();
  },
  handler: async (ctx, input) => {
    const cached = ctx.config.cache.get(input.key);
    if (cached) return cached;
    // ...
  },
});
```

## Evaluations

Test agent behavior with the eval framework:

```typescript
import { createPresetEval, type BaseEvalOptions } from '@agentuity/evals';

export const myEval = createPresetEval({
  name: 'quality-check',
  description: 'Checks response quality',
  options: {
    model: openai('gpt-4o'),
  },
  handler: async (ctx, input, output, options) => {
    return {
      passed: output.reply.length > 0,
      score: 0.85,
      reason: 'Response was non-empty and relevant',
    };
  },
});

// Attach to agent
agent.createEval(myEval());
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| `handler: async (ctx: AgentContext, input: MyType)` | `handler: async (ctx, input)` — let TS infer from schema |
| `const schema = { name: s.string() }` | `const schema = s.object({ name: s.string() })` — must wrap in s.object() |
| `console.log('debug')` | `ctx.logger.debug('debug')` — structured, observable |
| Using `fs` for storage | Use `ctx.kv`, `ctx.vector`, `ctx.stream` — platform-managed |

## Runtime Notes

- Agentuity projects always use **Bun** — never npm/pnpm
- The AI Gateway routes LLM calls through `new OpenAI()` automatically (no separate API keys)
- Agent files must `export default` the createAgent result
- Run `bun run dev` for local development with hot reload
