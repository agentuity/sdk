# GitHub Issue #250: Middleware Not Being Applied - Analysis

## Summary

The user reported that middleware (ClickHouse and Postgres clients) added in `src/api/index.ts` is not available in `src/api/deployments/route.ts`.

## Root Cause

**The middleware IS technically working** (Hono propagates it correctly), but **adding middleware in route files is NOT the recommended pattern** and can lead to issues.

### Why This Pattern Is Problematic

1. **Confusing Architecture**: When middleware is in `src/api/index.ts`, it's unclear which routes it applies to
2. **Initialization Order**: Route files are dynamically imported, making middleware timing unpredictable
3. **TypeScript Types**: Variables interface extensions might not propagate correctly across file boundaries
4. **Debugging Difficulty**: Hard to trace where middleware is coming from

## Tests Created

Created 5 comprehensive test files proving:

1. ✅ **Hono DOES propagate middleware correctly** - Middleware on parent router applies to mounted sub-routers
2. ✅ **The SDK architecture is correct** - Entry-generator order supports user middleware
3. ✅ **Middleware with `'*'` works across sibling routes** - Even routes mounted separately get the middleware

## Solution

**Move ALL middleware to `app.ts`** where it applies to the global router BEFORE routes are mounted.

### WRONG ❌ (Current Implementation)

**File: `src/api/index.ts`**
```typescript
import { createRouter } from '@agentuity/runtime';
import { clerkMiddleware } from '@hono/clerk-auth';
import { clickhouseMiddleware } from '../lib/clickhouse';
import { postgresMiddleware } from '../lib/postgres';

const api = createRouter();

// ❌ Middleware in route file - confusing and error-prone
api.use('*', clerkMiddleware({ ... }));
api.use('*', clickhouseMiddleware());
api.use('*', postgresMiddleware());

export default api;
```

### CORRECT ✅ (Recommended Pattern)

**File: `app.ts`**
```typescript
import { createApp } from '@agentuity/runtime';
import { clerkMiddleware } from '@hono/clerk-auth';
import { clickhouseMiddleware } from '../lib/clickhouse';
import { postgresMiddleware } from '../lib/postgres';

const app = await createApp({
  setup: async () => {
    // Your setup code
    return { /* state */ };
  },
});

// ✅ Add middleware to global router - applies to ALL /api/* routes
app.router.use('/api/*', clerkMiddleware({
  publishableKey: process.env.PUBLIC_CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
}));

app.router.use('/api/*', clickhouseMiddleware());
app.router.use('/api/*', postgresMiddleware());

export default app;
```

**File: `src/api/index.ts`** (Clean - no middleware)
```typescript
import { createRouter } from '@agentuity/runtime';

const api = createRouter();

// Just routes, no middleware
api.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

export default api;
```

**File: `src/api/deployments/route.ts`** (Clean - no middleware)
```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
  // Middleware available from app.ts!
  const clickhouse = c.var.clickhouseClient;
  const postgres = c.var.postgresClient;
  
  const deployments = await clickhouse.query('SELECT * FROM deployments');
  return c.json({ deployments });
});

export default router;
```

## TypeScript Types

Make sure to extend the Variables interface in a `.d.ts` file:

**File: `src/types/hono.d.ts`**
```typescript
import type { ClickHouseClient } from '../lib/clickhouse';
import type { PostgresClient } from '../lib/postgres';

declare module '@agentuity/runtime' {
  interface Variables {
    clickhouseClient?: ClickHouseClient;
    postgresClient?: PostgresClient;
    clerkAuth?: any; // Or proper Clerk type
  }
}
```

## Why This is Better

1. **Clear Separation**: Middleware in `app.ts`, routes in `src/api/`
2. **Predictable Order**: Middleware runs before ALL routes
3. **Type Safety**: Variables interface available across all route files
4. **Easier Debugging**: One place to look for middleware setup
5. **Follows Framework Conventions**: Standard Express/Hono pattern

## Additional Notes

- The SDK's `createApp().router` property gives access to the global router
- Middleware applied before routes are mounted (in entry-generator) works correctly
- The `'/api/*'` path ensures middleware only runs for API routes, not assets/web

## Next Steps for User

1. Move all middleware from `src/api/index.ts` to `app.ts`
2. Add TypeScript type declarations for new Variables
3. Remove middleware from route files - keep them focused on routing logic only
4. Test that middleware is available in all routes
