---
name: agentuity-react
description: "Use when: calling API routes with useAPI, real-time WebSocket communication with useWebsocket, server-sent events with useEventStream, or configuring AgentuityProvider."
globs:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/hooks/**/*.ts"
---

# Agentuity React SDK

## AgentuityProvider

Wrap your app to enable hooks:

```typescript
import { AgentuityProvider } from '@agentuity/react';

function App() {
  return (
    <AgentuityProvider baseUrl="https://api.example.com">
      <YourApp />
    </AgentuityProvider>
  );
}
```

Access context anywhere:

```typescript
import { useAgentuity } from '@agentuity/react';

function Component() {
  const { baseUrl, authHeader, setAuthHeader, isAuthenticated, authLoading } = useAgentuity();
  
  // Set auth after login
  setAuthHeader(`Bearer ${token}`);
}
```

---

## useAPI

Call typed API routes. GET requests auto-fetch; others require `invoke()`.

```typescript
import { useAPI } from '@agentuity/react';

// GET - auto-fetches on mount
const { data, isLoading, error, refetch } = useAPI('GET /api/users');

// POST - manual invoke
const { invoke, data, isLoading } = useAPI('POST /api/users');
await invoke({ name: 'Alice', email: 'alice@example.com' });
```

### Options

```typescript
const { data } = useAPI({
  route: 'GET /api/users',
  query: { search: 'term' },
  headers: { 'X-Custom': 'value' },
  enabled: true,           // Control when request executes
  staleTime: 5000,         // ms before data is stale
  refetchInterval: 10000,  // Auto-refetch interval
  onSuccess: (data) => {},
  onError: (error) => {},
});
```

### Streaming

```typescript
const { data } = useAPI({
  route: 'POST /api/chat',
  delimiter: '\n',
  onChunk: (chunk) => {
    console.log('Received:', chunk);
    return chunk;
  },
});
// data accumulates as T[]
```

### Return values

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T \| undefined` | Response data |
| `error` | `Error \| null` | Error if failed |
| `isLoading` | `boolean` | First load in progress |
| `isFetching` | `boolean` | Any fetch in progress |
| `isSuccess` | `boolean` | Request succeeded |
| `isError` | `boolean` | Request failed |
| `reset` | `() => void` | Reset state |
| `refetch` | `() => Promise<void>` | GET only |
| `invoke` | `(input) => Promise<T>` | POST/PUT/PATCH/DELETE only |

---

## useWebsocket

Bidirectional real-time communication with auto-reconnection.

```typescript
import { useWebsocket } from '@agentuity/react';

function Chat() {
  const { isConnected, messages, send, data, error, close } = useWebsocket('/ws/chat');
  
  return (
    <div>
      {messages.map((msg, i) => <div key={i}>{msg.text}</div>)}
      <button onClick={() => send({ text: 'Hello' })} disabled={!isConnected}>
        Send
      </button>
    </div>
  );
}
```

### Options

```typescript
const ws = useWebsocket('/ws/chat', {
  query: new URLSearchParams({ room: 'general' }),
  maxMessages: 100,  // Limit stored messages
  signal: abortController.signal,
});
```

### Return values

| Property | Type | Description |
|----------|------|-------------|
| `isConnected` | `boolean` | WebSocket is open |
| `data` | `T \| undefined` | Most recent message |
| `messages` | `T[]` | All received messages |
| `send` | `(data: TInput) => void` | Send message |
| `close` | `() => void` | Close connection |
| `clearMessages` | `() => void` | Clear message history |
| `error` | `Error \| null` | Connection error |
| `readyState` | `number` | 0=connecting, 1=open, 2=closing, 3=closed |

---

## useEventStream

Server-sent events for one-way server-to-client streaming.

```typescript
import { useEventStream } from '@agentuity/react';

function LiveFeed() {
  const { data, isConnected, error, close } = useEventStream('/api/events');
  
  return <div>{data?.message}</div>;
}
```

---

## Choosing the Right Hook

| Hook | Direction | Use Case |
|------|-----------|----------|
| `useAPI` | Request/Response | Forms, data fetching, mutations |
| `useWebsocket` | Client ↔ Server | Chat, multiplayer, collaborative editing |
| `useEventStream` | Server → Client | AI streaming, live dashboards, notifications |

---

## Common Patterns

### Loading states

```typescript
const { data, isLoading, isFetching } = useAPI('GET /api/users');

if (isLoading) return <Skeleton />;  // First load

return (
  <div>
    {isFetching && <RefreshIndicator />}  // Background refresh
    <UserList users={data} />
  </div>
);
```

### Conditional fetching

```typescript
const { data } = useAPI({
  route: 'GET /api/user',
  query: { id: userId },
  enabled: !!userId,  // Only fetch when userId exists
});
```

### Form submission

```typescript
const { invoke, isLoading, isSuccess, reset } = useAPI('POST /api/contact');

async function handleSubmit(formData) {
  try {
    await invoke(formData);
    showToast('Sent!');
    reset();  // Clear for next submission
  } catch {
    showToast('Failed');
  }
}
```

---

## Reference

- [React Hooks](https://preview.agentuity.dev/v1/Build/Frontend/react-hooks)
- [Provider Setup](https://preview.agentuity.dev/v1/Build/Frontend/provider-setup)
- [Advanced Hooks](https://preview.agentuity.dev/v1/Build/Frontend/advanced-hooks)
