# Agent Guidelines for @agentuity/react

## Package Overview

React hooks for building Agentuity web applications. Provides context, auth, WebRTC, and analytics hooks.

For type-safe API calls, use Hono's `hc()` client directly from `hono/client`.

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
├── index.ts            # Main exports (client-side)
├── server.ts           # Server-side entry point (SSR, server components)
├── client-entrypoint.tsx # Client entry point with 'use client' directive
├── context.tsx         # AgentuityProvider, useAgentuity, useAuth
├── webrtc.tsx          # useWebRTCCall hook
├── analytics.tsx       # useAnalytics, useTrackOnMount, withPageTracking
└── memo.ts             # useJsonMemo
```

**Entry points:**

- `@agentuity/react` - Client-side hooks (browser only)
- `@agentuity/react/server` - Server-safe exports (SSR, server components)
- `@agentuity/react/client` - Client entry with 'use client' directive

## Code Conventions

- **Provider required** - All hooks must be used within `AgentuityProvider`
- **SSR safe** - All hooks include SSR guards

## Hooks API

### useAuth

```typescript
const { isAuthenticated, authHeader, setAuthHeader, authLoading } = useAuth();
```

### useAgentuity

```typescript
const { baseUrl } = useAgentuity();
```

### useWebRTCCall

```typescript
const { state, connect, disconnect } = useWebRTCCall(options);
```

### useAnalytics

```typescript
const { track, trackClick, identify } = useAnalytics();
track('event_name', { prop: 'value' });
```

### Other Hooks

- `useTrackOnMount(options)` - Track event on mount
- `useJsonMemo(value)` - Deep equality memoization
- `withPageTracking(Component, pageName)` - HOC for page tracking

## Type-Safe API Calls

Use Hono's `hc()` client for type-safe API calls:

```typescript
import { hc } from 'hono/client';
import type { AppType } from './src/api/router';

const client = hc<AppType>('/');
const res = await client.api.hello.$post({ json: { name: 'World' } });
const data = await res.json();
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core and @agentuity/frontend
