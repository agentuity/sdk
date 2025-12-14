---
name: testing-and-debugging-agents
description: Test patterns for Agentuity agents - mocking AgentContext, using app.request(), test organization, and debugging strategies
globs:
  - "**/test/**/*.ts"
  - "**/*.test.ts"
  - "**/*.spec.ts"
---

# Testing and Debugging Agents

## When to Use
- Writing unit tests for agent handlers
- Integration testing agent routes
- Mocking storage and external services
- Debugging agent execution

## Test Organization

All tests go in `test/` folder parallel to `src/`:

```
packages/my-package/
├── src/
│   └── agents/
│       └── user.agent.ts
├── test/
│   └── agents/
│       └── user.agent.test.ts
└── tsconfig.test.json
```

## Testing Agent Handlers

### Basic Handler Test

```typescript
import { describe, test, expect } from 'bun:test';
import { createMockAgentContext } from '@agentuity/test-utils';
import userAgent from '../src/agents/user.agent';

describe('user agent', () => {
  test('returns user data', async () => {
    const ctx = createMockAgentContext();
    
    const result = await userAgent.handler(ctx, { userId: '123' });
    
    expect(result.name).toBeDefined();
  });
});
```

### Mocking Storage

```typescript
import { createMockAgentContext, createMockKV } from '@agentuity/test-utils';

test('stores user in KV', async () => {
  const mockKV = createMockKV({
    'user:123': { name: 'Alice', email: 'alice@example.com' },
  });
  
  const ctx = createMockAgentContext({ kv: mockKV });
  
  const result = await userAgent.handler(ctx, { userId: '123' });
  
  expect(result.name).toBe('Alice');
  expect(mockKV.set).toHaveBeenCalledWith('user:123', expect.any(Object));
});
```

## Testing Routes with app.request()

**IMPORTANT**: Use `app.request()` instead of Hono's `testClient()` for type safety.

```typescript
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import userAgent from '../src/agents/user.agent';

describe('user routes', () => {
  test('POST /users creates user', async () => {
    const app = new Hono()
      .post('/users', userAgent.validator(), async (c) => {
        const data = c.req.valid('json');
        const result = await userAgent.run(data);
        return c.json(result);
      });

    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBeDefined();
  });

  test('validates input schema', async () => {
    const app = new Hono()
      .post('/users', userAgent.validator(), async (c) => {
        return c.json({ ok: true });
      });

    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' }),
    });

    expect(res.status).toBe(400);
  });
});
```

## Type Inference Best Practices

**CRITICAL**: Let TypeScript infer handler parameter types from the schema.

```typescript
// ✅ CORRECT: Types inferred from schema
const agent = createAgent('user', {
  schema: {
    input: s.object({ name: s.string() }),
    output: s.object({ id: s.string() }),
  },
  handler: async (ctx, input) => {
    // input is typed as { name: string }
    return { id: `user-${input.name}` };
  },
});

// ❌ WRONG: Explicit types defeat inference
handler: async (ctx: AgentContext, input: any) => { ... }
```

## Debugging Strategies

### Enable Debug Logging

```bash
# Run with debug logging
AGENTUITY_LOG_LEVEL=debug bun run dev
```

### Log Context State

```typescript
handler: async (ctx, input) => {
  ctx.logger.debug('Handler started', {
    sessionId: ctx.sessionId,
    input,
  });
  
  // ... handler logic
  
  ctx.logger.debug('Handler completed', { result });
  return result;
}
```

### Trace Performance

```typescript
handler: async (ctx, input) => {
  const span = ctx.tracer.startSpan('process-order');
  try {
    const result = await processOrder(input);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
}
```

## Common Pitfalls

1. **Using testClient()** - Returns `unknown` type, use `app.request()` instead
2. **Adding explicit types** - Defeats TypeScript inference from schemas
3. **Tests in src/** - Put all tests in `test/` folder
4. **Importing from `../`** - Tests should import from `../src/`

## Test Quality Requirements

Before code is complete:
- ✅ 0 test failures
- ✅ 0 typecheck errors
- ✅ 0 lint warnings

```bash
bun test
bunx tsc --project tsconfig.test.json --noEmit
bun run lint
```

## Checklist

- [ ] Tests in `test/` folder (not `src/`)
- [ ] Import from `../src/` in tests
- [ ] Use `app.request()` for route tests
- [ ] No explicit type annotations on handler params
- [ ] Mock storage for unit tests
- [ ] Check both success and error paths

## See Also

- [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)
- `using-agent-context-apis` for context mocking
- `working-with-evaluations-and-metrics` for eval testing
