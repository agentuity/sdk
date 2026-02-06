# Agent Guidelines for @agentuity/react

## Package Overview

React hooks for building Agentuity web applications. Provides type-safe hooks for API calls, WebSocket, Server-Sent Events, and analytics.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Browser only
- **Dependencies**: `@agentuity/core`, `@agentuity/frontend`
- **Peer dependencies**: React 18+ or 19+

## Structure

```text
src/
├── index.ts        # Main exports (client-side)
├── server.ts       # Server-side entry point (SSR, server components, API routes)
├── context.tsx     # AgentuityProvider, useAgentuity, useAuth
├── api.ts          # useAPI hook
├── websocket.ts    # useWebsocket hook
├── eventstream.ts  # useEventStream hook
├── client.ts       # createClient, createAPIClient
├── analytics.tsx   # useAnalytics, useTrackOnMount, withPageTracking
└── memo.ts         # useJsonMemo
```

**Entry points:**

- `@agentuity/react` - Client-side hooks (browser only)
- `@agentuity/react/server` - Server-safe exports (SSR, server components)

## Code Conventions

- **Provider required** - All hooks must be used within `AgentuityProvider`
- **Type inference** - Types inferred from generated registries (RouteRegistry, etc.)
- **SSR safe** - All hooks include SSR guards

## Hooks API

### useAPI (main HTTP hook)

```typescript
// GET auto-executes, returns refetch()
const { data, isLoading, error, refetch } = useAPI('GET /users');

// POST/PUT/PATCH/DELETE manual via invoke()
const { data, invoke } = useAPI('POST /users');
await invoke({ name: 'Alice' });
```

Returns: `{ data, error, isLoading, isSuccess, isError, isFetching, reset, refetch|invoke }`

### useWebsocket

```typescript
const { isConnected, data, messages, send, close, clearMessages } = useWebsocket('/ws');
send({ message: 'Hello' });
```

- `data` = latest message, `messages` = all messages
- Auto-reconnection on connection loss

### useEventStream (SSE)

```typescript
const { isConnected, data, close, error, isError, reset, readyState } = useEventStream('/events');
```

- Auto-reconnection on connection loss
- `data` = latest event (with JSON memoization)

### useAuth

```typescript
const { isAuthenticated, authHeader, setAuthHeader, authLoading } = useAuth();
```

### useAnalytics

```typescript
const { track, trackClick, identify } = useAnalytics();
track('event_name', { prop: 'value' });
```

### Other Hooks

- `useAgentuity()` - Access baseUrl
- `useTrackOnMount(options)` - Track event on mount
- `useJsonMemo(value)` - Deep equality memoization
- `withPageTracking(Component, pageName)` - HOC for page tracking

## Client Functions

```typescript
const api = createAPIClient();
await api.hello.post({ name: 'World' });
```

## Generated Types

Route registries are augmented via `declare module '@agentuity/frontend'`. See `@agentuity/frontend` for registry interfaces.

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core and @agentuity/frontend
