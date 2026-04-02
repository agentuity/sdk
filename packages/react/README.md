# @agentuity/react

> ⚠️ **DEPRECATED** — This package is deprecated in v2 and will not receive further updates.
>
> ## Migration Guide
>
> ### Authentication
> Use your auth provider directly instead of `AgentuityProvider`:
> - **better-auth**: `import { createAuthClient } from 'better-auth/react'`
> - **Clerk**: `import { ClerkProvider } from '@clerk/clerk-react'`
> - **Auth0**: `import { Auth0Provider } from '@auth0/auth0-react'`
>
> ### API Calls
> Use Hono's `hc()` client for type-safe API calls:
> ```tsx
> import { hc } from 'hono/client';
> import type router from './src/api';
>
> const client = hc<typeof router>('/');
> const res = await client.api.hello.$post({ json: { name: 'World' } });
> ```
>
> ### WebSocket / EventStream / WebRTC
> Import directly from `@agentuity/frontend`:
> ```tsx
> import { WebSocketManager, EventStreamManager, WebRTCManager } from '@agentuity/frontend';
> ```
>
> ### Analytics
> Use `@agentuity/frontend` directly:
> ```tsx
> import { getAnalytics, track } from '@agentuity/frontend';
>
> // In a React component, create your own hook:
> function useAnalytics() {
>   return getAnalytics();
> }
> ```
>
> ### What's Removed
> - `AgentuityProvider` / `AgentuityContext` — Use your auth provider's context
> - `useAuth()` — Use your auth provider's hooks
> - `useAPI()` — Use Hono `hc()` client directly
> - `createClient()` — Use Hono `hc()` client directly
> - `RouteRegistry` / `RPCRouteRegistry` types — Derive from Hono router

---

React hooks and components for building Agentuity web applications.

## Installation

```bash
bun add @agentuity/react
```

## Quick Start

```tsx
import { AgentuityProvider, useAuth } from '@agentuity/react';

function App() {
   return (
      <AgentuityProvider>
         <MyComponent />
      </AgentuityProvider>
   );
}

function MyComponent() {
   const { isAuthenticated } = useAuth();
   return <div>{isAuthenticated ? 'Logged in' : 'Not logged in'}</div>;
}
```

## Type-Safe API Calls

Use Hono's `hc()` client for type-safe API calls:

```tsx
import { hc } from 'hono/client';
import type { AppType } from './src/api/router';

const client = hc<AppType>('/');
const res = await client.api.hello.$post({ json: { name: 'World' } });
const data = await res.json();
```

## Available Hooks

- `useAgentuity()` - Access base URL and context
- `useAuth()` - Authentication state management
- `useWebRTCCall()` - WebRTC connections
- `useAnalytics()` - Event tracking
- `useTrackOnMount()` - Track event on component mount
- `useJsonMemo()` - Deep equality memoization

## Re-exported Utilities

From `@agentuity/frontend`:

- `WebSocketManager` - Framework-agnostic WebSocket manager
- `EventStreamManager` - Framework-agnostic SSE manager
- `WebRTCManager` - Framework-agnostic WebRTC manager
- `buildUrl`, `defaultBaseUrl`, `deserializeData`, `jsonEqual`
