---
name: debugging-and-observing-apps
description: End-to-end debugging workflow for Agentuity applications - combining CLI tools, runtime logging, tracing, and metrics
globs:
  - "**/*.ts"
---

# Debugging and Observing Apps

## When to Use
- Diagnosing production issues
- Understanding request flow through agents
- Analyzing performance bottlenecks
- Correlating logs, traces, and metrics

## Debugging Workflow

### 1. Start with CLI Diagnostics

```bash
# Check project configuration
agentuity project info

# View recent deployments
agentuity cloud deploy list

# Check environment variables
agentuity cloud env list
```

### 2. Enable Local Debug Mode

```bash
# Run with verbose logging
agentuity dev --log-level=debug

# Use local services for isolation
agentuity dev --local
```

### 3. Add Strategic Logging

```typescript
handler: async (ctx, input) => {
  const { logger } = ctx;
  
  // Log entry with input summary (not full payload for PII)
  logger.info('Agent started', { 
    action: input.action,
    hasPayload: !!input.payload,
  });
  
  try {
    const result = await processRequest(input);
    logger.info('Agent completed', { resultType: typeof result });
    return result;
  } catch (error) {
    logger.error('Agent failed', { 
      error: error.message,
      code: error.code,
    });
    throw error;
  }
}
```

## Tracing for Performance

### Create Custom Spans

```typescript
import { SpanStatusCode } from '@opentelemetry/api';

handler: async (ctx, input) => {
  // Trace external API call
  const apiSpan = ctx.tracer.startSpan('external-api-call');
  try {
    const data = await fetchExternalAPI(input.query);
    apiSpan.setAttribute('response.size', JSON.stringify(data).length);
    apiSpan.setStatus({ code: SpanStatusCode.OK });
  } finally {
    apiSpan.end();
  }
  
  // Trace database operation
  const dbSpan = ctx.tracer.startSpan('database-query');
  try {
    const rows = await ctx.kv.list('user:*');
    dbSpan.setAttribute('rows.count', rows.length);
    dbSpan.setStatus({ code: SpanStatusCode.OK });
  } finally {
    dbSpan.end();
  }
}
```

### Trace Nested Agent Calls

```typescript
handler: async (ctx, input) => {
  const span = ctx.tracer.startSpan('orchestrate-workflow');
  
  // First agent
  span.addEvent('calling-validation-agent');
  const validated = await validationAgent.run(input);
  
  // Second agent
  span.addEvent('calling-processing-agent');
  const processed = await processingAgent.run(validated);
  
  span.end();
  return processed;
}
```

## Event Listeners for Observability

```typescript
const app = await createApp({
  setup: async () => ({ startTime: Date.now() }),
});

// Track agent timing
app.addEventListener('agent.started', (_, agent, ctx) => {
  ctx.state.set('agentStartTime', Date.now());
  ctx.logger.debug(`Agent ${agent.metadata.name} started`);
});

app.addEventListener('agent.completed', (_, agent, ctx) => {
  const start = ctx.state.get('agentStartTime') as number;
  const duration = Date.now() - start;
  ctx.logger.info(`Agent ${agent.metadata.name} completed`, { duration });
});

app.addEventListener('agent.errored', (_, agent, ctx, error) => {
  ctx.logger.error(`Agent ${agent.metadata.name} failed`, {
    error: error.message,
    stack: error.stack,
  });
});
```

## Common Issues and Solutions

### Issue: Agent Timeout

```typescript
// Add timeout tracking
handler: async (ctx, input) => {
  const timeout = setTimeout(() => {
    ctx.logger.warn('Agent running long', { elapsed: '10s' });
  }, 10000);
  
  try {
    return await processRequest(input);
  } finally {
    clearTimeout(timeout);
  }
}
```

### Issue: Memory Leaks

```typescript
// Use waitUntil for cleanup, not in-handler state
handler: async (ctx, input) => {
  const result = processLargeData(input);
  
  // Defer cleanup to avoid blocking response
  ctx.waitUntil(async () => {
    await cleanupTempFiles();
    ctx.logger.debug('Cleanup complete');
  });
  
  return result;
}
```

### Issue: Storage Errors

```typescript
// Always handle storage failures gracefully
handler: async (ctx, input) => {
  try {
    const cached = await ctx.kv.get('cache-key');
    if (cached) return cached;
  } catch (error) {
    ctx.logger.warn('Cache miss due to error', { error: error.message });
    // Continue without cache
  }
  
  const fresh = await computeResult(input);
  
  // Best-effort cache write
  ctx.waitUntil(async () => {
    try {
      await ctx.kv.set('cache-key', fresh, { ttl: 3600 });
    } catch {
      // Ignore cache write failures
    }
  });
  
  return fresh;
}
```

## Log Levels Guide

| Level | Use For |
|-------|---------|
| `debug` | Detailed internal state, development only |
| `info` | Normal operations, request flow |
| `warn` | Recoverable issues, deprecations |
| `error` | Failures requiring attention |

## Checklist

- [ ] Use `ctx.logger` not `console.log`
- [ ] Add spans around external calls
- [ ] Log structured data, not string concatenation
- [ ] Handle errors in event listeners
- [ ] Use `--local` for isolated debugging
- [ ] Check `agentuity dev --log-level=debug` output

## See Also

- [CLI Reference](https://preview.agentuity.dev/v1/Reference/CLI)
- `handling-runtime-events-and-logging` for logger API
- `using-agent-context-apis` for tracer API
