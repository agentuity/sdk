# Middleware Patterns - Integration Tests

This test suite validates that custom middleware works correctly in Agentuity applications, addressing GitHub Issue #250.

## Overview

These tests prove that middleware can be added in **two locations**:

1. **`app.ts`** - Global middleware that applies to all routes
2. **`src/api/index.ts`** - API-specific middleware that applies to all `/api/*` routes

Both patterns work correctly and middleware from both layers is available in route handlers.

## Test Files

- **`src/lib/custom-middleware.ts`** - Mock middleware functions (database, auth, analytics)
- **`src/types/middleware.d.ts`** - TypeScript declarations for custom variables
- **`app.ts`** - Adds global middleware (auth, analytics, custom data)
- **`src/api/index.ts`** - Adds API-level middleware (database clients, custom data)
- **`src/api/middleware-test/route.ts`** - Route that validates middleware
- **`src/test/middleware-patterns.ts`** - Test suite (9 tests)

## Tests

### 1. App-level Middleware Available ✅
Validates that middleware added in `app.ts` is available in routes:
- Auth user data
- Request ID and count (analytics)
- Custom app-level data

### 2. API-level Middleware Available ✅
Validates that middleware added in `src/api/index.ts` is available in routes:
- ClickHouse database client
- Postgres database client
- Custom API-level data

### 3. Both Middleware Layers Work ✅
Proves that middleware from BOTH `app.ts` and `api/index.ts` work together in the same route.

### 4. Database Clients Functional ✅
Tests that mock database clients from middleware can actually execute queries.

### 5. Auth Middleware Provides User ✅
Validates auth middleware sets user information correctly.

### 6. Analytics Middleware Tracks Requests ✅
Tests that analytics middleware increments request counters.

### 7. Middleware Applies to All API Routes ✅
Confirms middleware runs for all `/api/*` routes, not just specific ones.

### 8. Separate Route Files Get Middleware ✅ (KEY TEST)
**This is the critical test for Issue #250:**
Routes in separate files (like `src/api/middleware-test/route.ts`) still receive middleware from `src/api/index.ts`.

### 9. Middleware Execution Order ✅
Validates that middleware executes in the correct order:
1. App-level middleware (`app.ts`)
2. API-level middleware (`api/index.ts`)
3. Route handler

## Running Tests

```bash
# Build
bun run build

# Start server
cd .agentuity && bun run app.js &

# Run middleware pattern tests
curl "http://localhost:3500/api/test/run?suite=middleware-patterns"

# Or run all tests
curl "http://localhost:3500/api/test/run"
```

## Example Usage

### Adding Middleware in app.ts

```typescript
import { createApp } from '@agentuity/runtime';

const app = await createApp({ ... });

// Add global middleware
app.router.use('/api/*', authMiddleware());
app.router.use('/api/*', analyticsMiddleware());

export default app;
```

### Adding Middleware in src/api/index.ts

```typescript
import { createRouter } from '@agentuity/runtime';
import { databaseMiddleware } from '../lib/database';

const router = createRouter();

// Add API-specific middleware
router.use('*', databaseMiddleware());

export default router;
```

### Using Middleware in Routes

```typescript
// src/api/users/route.ts
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
  // Access app.ts middleware
  const user = c.get('authUser');
  
  // Access api/index.ts middleware
  const db = c.get('databaseClient');
  
  const users = await db.query('SELECT * FROM users');
  return c.json({ users });
});

export default router;
```

## TypeScript Support

Extend the `ContextVariableMap` to add type safety:

```typescript
// src/types/middleware.d.ts
declare module 'hono' {
  interface ContextVariableMap {
    databaseClient?: DatabaseClient;
    authUser?: User;
  }
}
```

## Key Takeaways

1. ✅ **Middleware in `api/index.ts` IS valid** - It works correctly
2. ✅ **Middleware propagates to sibling routes** - Routes mounted separately still get the middleware
3. ✅ **Both `app.ts` and `api/index.ts` middleware work together**
4. ⚠️ **Middleware must handle errors gracefully** - Don't throw before calling `await next()`

## Related Issues

- GitHub Issue #250: Middleware not being applied
- Root cause: Middleware throwing errors before setting context variables
- Solution: Wrap client creation in try-catch or validate env vars before throwing
