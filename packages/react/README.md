# @agentuity/react

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
