# Context Flow in Agentuity Runtime

This document explains how context variables flow through the system and the difference between HonoContext and AgentContext.

## Two Contexts

The runtime has **two separate contexts** that serve different purposes:

### 1. HonoContext (`c`) - HTTP Request Context

**Used by**: Route handlers  
**Access pattern**: `c.var.*`  
**Set via**: `c.set('key', value)` in middleware

**Variables** (from `Variables` interface in `app.ts`):

- `c.var.logger` - Logger instance
- `c.var.tracer` - OpenTelemetry tracer
- `c.var.meter` - OpenTelemetry meter
- `c.var.sessionId` - Session ID
- `c.var.thread` - Thread instance
- `c.var.session` - Session instance
- `c.var.kv` - Key-value storage
- `c.var.stream` - Stream storage
- `c.var.vector` - Vector storage
- `c.var.app` - Application state

**Private variables** (internal use):

- `c.var.waitUntilHandler` - Background task handler
- `c.var.routeId` - Route identifier
- `c.var.agentIds` - Set of agent IDs
- `c.var.trigger` - Trigger type

### 2. AgentContext (`ctx`) - Agent Handler Context

**Used by**: Agent handlers (first parameter)  
**Access pattern**: `ctx.*`  
**Set via**: Constructor + `registerServices()`

**Properties**:

- `ctx.logger` - Logger instance (from c.var.logger)
- `ctx.tracer` - OpenTelemetry tracer (from c.var.tracer)
- `ctx.sessionId` - Session ID (from c.var.sessionId)
- `ctx.thread` - Thread instance (from c.var.thread)
- `ctx.session` - Session instance (from c.var.session)
- `ctx.kv` - Key-value storage (property getter → module-level service)
- `ctx.stream` - Stream storage (property getter → module-level service)
- `ctx.vector` - Vector storage (property getter → module-level service)
- `ctx.app` - Application state (from c.var.app)
- `ctx.agent` - Agent registry
- `ctx.config` - Agent-specific config
- `ctx.state` - Agent state map
- `ctx.waitUntil()` - Method to run background tasks

## Flow Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Request arrives                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│ 2. _server.ts: First middleware                             │
│    c.set('logger', otel.logger)                             │
│    c.set('tracer', otel.tracer)                             │
│    c.set('meter', otel.meter)                               │
│    c.set('app', globalAppState)                             │
│    c.set('kv', services.kv)        ◄── NEW!                 │
│    c.set('stream', services.stream) ◄── NEW!                │
│    c.set('vector', services.vector) ◄── NEW!                │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│ 3. _server.ts: otelMiddleware                               │
│    c.set('sessionId', sessionId)                            │
│    c.set('thread', thread)                                  │
│    c.set('session', session)                                │
│    _c.set('waitUntilHandler', handler)                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│ 4. Route handler OR Agent middleware                        │
│                                                             │
│    Route handler:                                           │
│    - Uses c.var.logger, c.var.kv, etc.                      │
│    - Direct access to HonoContext                           │
│                                                             │
│    OR                                                       │
│                                                             │
│    createAgentMiddleware:                                   │
│    - Extracts values from c.var.*                           │
│    - Creates RequestAgentContext                            │
│    - Stores in AsyncLocalStorage                            │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│ 5. Agent handler receives ctx                               │
│    - ctx.logger (from c.var.logger)                         │
│    - ctx.kv (property getter → services.kv)                 │
│    - ctx.sessionId (from c.var.sessionId)                   │
│    - etc.                                                   │
└─────────────────────────────────────────────────────────────┘
```

## Key Points

### Services (kv, stream, vector)

**HonoContext**:

- Set once per request in `_server.ts` middleware
- Retrieved from module-level variables via `getServices()`
- Available as `c.var.kv`, `c.var.stream`, `c.var.vector`

**AgentContext**:

- Set via property getters in `registerServices()` (called in constructor)
- Property getters return module-level variables directly
- Available as `ctx.kv`, `ctx.stream`, `ctx.vector`
- **Same underlying services** as HonoContext

### No Property Copying

Prior implementations copied properties from AgentContext back to HonoContext. This is **no longer necessary** because:

1. All HonoContext variables are set via `c.set()` in `_server.ts`
2. AgentContext gets its values from HonoContext (via constructor args)
3. Services use property getters that reference module-level singletons
4. The two contexts serve different purposes and don't need to mirror each other

### AsyncLocalStorage

AgentContext is stored in AsyncLocalStorage so agent handlers can access it:

- Direct parameter: `handler(ctx, input)`
- Via `getAgentContext()` from anywhere inside agent execution

HonoContext is also stored in AsyncLocalStorage for HTTP context access:

- Via `getHTTPContext()` from anywhere inside request handling

## Testing

Tests verify both contexts work correctly:

**AgentContext tests** (`agent.test.ts`):

```typescript
const agent = createAgent('test', {
	handler: async (ctx, input) => {
		await ctx.kv.set('store', 'key', 'value'); // ✅
		return 'ok';
	},
});
```

**HonoContext tests** (`context-variables.test.ts`):

```typescript
app.post('/test', async (c) => {
	await c.var.kv.set('store', 'key', 'value'); // ✅
	return c.json({ ok: true });
});
```

## Migration Notes

**Before (incorrect)**:

- kv, stream, vector were copied from AgentContext to HonoContext in `setupRequestAgentContext`
- This created duplicates and was unnecessary

**After (correct)**:

- kv, stream, vector are set on HonoContext in `_server.ts` alongside other variables
- AgentContext gets them via property getters
- No copying between contexts needed
