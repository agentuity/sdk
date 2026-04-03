---
name: agentuity-frontend
description: When building website or app frontends that connect to Agentuity agents and services. Covers @agentuity/react hooks, @agentuity/auth for login flows, @agentuity/frontend for WebRTC and real-time communication, and @agentuity/workbench for the agent testing UI.
version: 2.0.0
---

# Agentuity Frontend Reference

## Package Overview

| Package                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `@agentuity/react`     | React hooks for context, auth, WebRTC, and analytics |
| `@agentuity/frontend`  | Framework-agnostic web utilities                      |
| `@agentuity/auth`      | Authentication (server + client)                      |
| `@agentuity/workbench` | Dev UI for testing agents                             |

## Key Concepts

- Use `hc<AppRouter>()` from `hono/client` for type-safe API calls — `useAPI` and `createClient` were removed in v2
- Chained Hono methods (`.get().post()`) are required for type inference with `hc()`
- `useAuth()` for authentication state, `useAnalytics()` for tracking
- Wrap app with `<AgentuityProvider>` (and `<AuthProvider>` if using auth)
- Auth tokens from `useAuth()` must be passed to `hc()` calls manually
- `baseUrl` prop only needed if frontend is hosted separately from Agentuity
- Server auth via `createAuth()`, `createSessionMiddleware()`, `mountAuthRoutes()` from `@agentuity/auth`
- `AuthProvider` is exported from `@agentuity/auth/react` (not `@agentuity/react`)
- Build config goes in standard `vite.config.ts` (not `agentuity.config.ts`)

## Type-Safe API Calls (v2)

v2 removed `useAPI`, `createClient`, and `RPCRouteRegistry`. Use Hono's `hc()` client for fully typed API calls:

```tsx
import { hc } from 'hono/client';
import type { AppRouter } from '../api';

const client = hc<AppRouter>('/api');

// Fully typed — routes inferred from your Hono router
const res = await client.hello.$get();
const data = await res.json();
```

For richer data fetching (caching, background updates), pair with TanStack Query, SWR, or any library you prefer — v2 doesn't prescribe a data fetching approach.

## Authentication

### Server Setup

```typescript
import { createAuth, createSessionMiddleware, mountAuthRoutes } from '@agentuity/auth';
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';

const auth = createAuth({
  connectionString: process.env.DATABASE_URL,
});

const router = new Hono<Env>()
  .on(['GET', 'POST'], '/api/auth/*', mountAuthRoutes(auth))
  .use('/api/*', createSessionMiddleware(auth));
```

### Client Setup

```tsx
import { AgentuityProvider, useAuth } from '@agentuity/react';
import { AuthProvider } from '@agentuity/auth/react';

function App() {
  return (
    <AuthProvider>
      <AgentuityProvider>
        <MyApp />
      </AgentuityProvider>
    </AuthProvider>
  );
}
```

### Using Auth in Agent Handlers

When auth middleware is active, `ctx.auth` is available:

```typescript
handler: async (ctx, input) => {
  if (!ctx.auth) return { error: 'Please sign in' };
  const user = await ctx.auth.getUser();
  return { message: `Hello ${user.name}` };
}
```

## Documentation Links

| Topic | Link |
| --- | --- |
| React Hooks | https://agentuity.dev/frontend/react-hooks.md |
| Provider Setup | https://agentuity.dev/frontend/provider-setup.md |
| Authentication | https://agentuity.dev/frontend/authentication.md |
| Advanced Hooks | https://agentuity.dev/frontend/advanced-hooks.md |
| RPC Client | https://agentuity.dev/frontend/rpc-client.md |
| Static Rendering | https://agentuity.dev/frontend/static-rendering.md |
| Deployment Scenarios | https://agentuity.dev/frontend/deployment-scenarios.md |
| Workbench | https://agentuity.dev/frontend/workbench.md |
| Migration Guide | https://agentuity.dev/reference/migration-guide.md |

## Common Mistakes

| Mistake                                   | Better Approach            | Why                                             |
| ----------------------------------------- | -------------------------- | ----------------------------------------------- |
| Using `useAPI` or `createClient` (v1)     | Use `hc<AppRouter>()` from `hono/client` | These were removed in v2 — use Hono's typed client |
| Using mutating router style (`.get()`)    | Use chained style (`.get().post()`) | Only chained methods preserve types for `hc()` |
| Adding `baseUrl` inside Agentuity project | Omit `baseUrl`             | Auto-detected in full-stack projects            |
| Manual WebSocket management               | Use `useWebsocket` hook    | Auto-reconnect, auth injection, message queuing |
| Missing AuthProvider                      | Wrap app with AuthProvider | Required for auth token injection               |
| Calling `/agent/<name>` from frontend     | Call `/api/<name>` routes instead | Agents aren't HTTP endpoints — call the API route that wraps the agent |
| Putting secrets in frontend env vars      | Only use `AGENTUITY_PUBLIC_*`, `VITE_*`, or `PUBLIC_*` prefixes | These prefixes are exposed to the browser — never put API keys in them |
| Vite config in `agentuity.config.ts`      | Use standard `vite.config.ts` | v2 moved build config to standard Vite config |

## Environment Variables for Frontend

Only variables with these prefixes are exposed to the browser bundle:
- `AGENTUITY_PUBLIC_*`
- `VITE_*`
- `PUBLIC_*`

**Never put secrets or API keys in these variables.** LLM API keys are not needed anyway — the AI Gateway handles LLM routing server-side.

## When In Doubt, Check the Docs

If you're unsure about any hook, provider, or pattern, **check the documentation first** rather than guessing:

- Full docs: https://agentuity.dev
- LLM-friendly index: https://agentuity.dev/llms.txt
- React Hooks: https://agentuity.dev/frontend/react-hooks.md
- Migration Guide: https://agentuity.dev/reference/migration-guide.md
