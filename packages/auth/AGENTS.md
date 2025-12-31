# Agent Guidelines for @agentuity/auth

## Package Overview

First-class authentication for Agentuity projects, powered by BetterAuth. Provides server middleware, React components, and Drizzle schema.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Test**: `bun test`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Dual-target (browser for client, Bun/Node for server)
- **Server**: Hono middleware with OpenTelemetry integration
- **Client**: React hooks via `@agentuity/react` context
- **Database**: Drizzle ORM schema with BetterAuth adapters
- **Engine**: BetterAuth (internal implementation detail)

## Structure

```
src/
├── index.ts           # Root package exports (server + client)
├── types.ts           # Generic AgentuityAuth interface
├── schema.ts          # Drizzle table definitions and relations
└── agentuity/
    ├── index.tsx      # Main exports (re-exports from submodules)
    ├── config.ts      # createAgentuityAuth factory
    ├── server.ts      # Hono middleware (session, API key)
    ├── client.tsx     # AgentuityAuthProvider React component
    ├── react.ts       # createAgentuityAuthClient factory
    └── types.ts       # Agentuity-specific types (org, API key context)
```

## Code Conventions

- **Naming**: All public APIs use "AgentuityAuth" prefix, not "BetterAuth"
- **Env vars**: Prefer `AGENTUITY_AUTH_SECRET` over `BETTER_AUTH_SECRET`
- **Defaults**: basePath `/api/auth`, emailAndPassword enabled
- **React imports**: All React code from `@agentuity/auth/react` (AgentuityAuthProvider, createAgentuityAuthClient, useAgentuityAuth)

## Key Patterns

### Server Setup

```typescript
import { createAgentuityAuth, createSessionMiddleware, mountAgentuityAuthRoutes } from '@agentuity/auth';

const auth = createAgentuityAuth({
  connectionString: process.env.DATABASE_URL,
});

api.on(['GET', 'POST'], '/api/auth/*', mountAgentuityAuthRoutes(auth));
api.use('/api/*', createSessionMiddleware(auth));
```

### Agent Handler (ctx.auth is native)

```typescript
export default createAgent('my-agent', {
  handler: async (ctx, input) => {
    if (!ctx.auth) return { error: 'Unauthorized' };
    return { userId: ctx.auth.user.id };
  },
});
```

### React Client

```tsx
import { createAgentuityAuthClient, AgentuityAuthProvider } from '@agentuity/auth/react';

const authClient = createAgentuityAuthClient();

<AgentuityAuthProvider authClient={authClient}>
  <App />
</AgentuityAuthProvider>
```

## Important Types

- `AgentuityAuthInterface` - Full auth on `c.var.auth` (user + org + API key helpers)
- `AgentuityAuthContext` - Auth context with user, session, org
- `AgentuityOrgContext` - Organization with role and membership
- `AgentuityApiKeyContext` - API key with permissions
- `AgentuityAuthMethod` - 'session' | 'api-key' | 'bearer'

## Database Options

1. **connectionString** - Simplest: we create Bun SQL connection + drizzle internally
2. **database** - Bring your own drizzle adapter or other BetterAuth adapter
3. **@agentuity/auth/schema** - Export for merging with app schema

## Default Plugins

- `organization` - Multi-tenancy
- `jwt` - Token generation
- `bearer` - Bearer token auth
- `apiKey` - API key management

Use `skipDefaultPlugins: true` to disable.

## Testing

- Use `bun test` for all tests
- Mock auth context in route tests
- Test both session and API key middleware
- When running tests, prefer using a subagent (Task tool) to avoid context bloat

## Publishing

1. Run build, typecheck, test
2. Publish **after** `@agentuity/core` and `@agentuity/react`
3. `@agentuity/runtime` depends on this package for types
