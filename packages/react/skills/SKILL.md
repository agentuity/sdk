---
name: agentuity-react-sdk
description: React hooks and components for building Agentuity web applications with type-safe API calls, WebSocket communication, and SSE event streams
globs:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/hooks/**/*.ts"
---

# Agentuity React SDK

## Configuring AgentuityProvider in React

### When to Use
- Setting up any React app that uses Agentuity hooks
- Configuring base URL for API calls
- Managing authentication state across components

### Core API

```typescript
import { AgentuityProvider, useAgentuity } from '@agentuity/react';

// Wrap your app with the provider
function App() {
  return (
    <AgentuityProvider baseUrl="https://api.example.com">
      <YourApp />
    </AgentuityProvider>
  );
}

// Access context anywhere in your app
function Component() {
  const { 
    baseUrl,           // Current base URL
    authHeader,        // Current auth header (e.g., "Bearer xxx")
    setAuthHeader,     // Set auth token
    authLoading,       // Whether auth is being verified
    setAuthLoading,    // Set loading state
    isAuthenticated    // Convenience: !authLoading && authHeader !== null
  } = useAgentuity();
}
```

### Key Patterns

**Setting authentication after login:**
```typescript
const { setAuthHeader } = useAgentuity();

async function handleLogin(credentials) {
  const { token } = await loginAPI(credentials);
  setAuthHeader(`Bearer ${token}`);
}
```

**Conditional rendering based on auth:**
```typescript
const { isAuthenticated, authLoading } = useAgentuity();

if (authLoading) return <Spinner />;
if (!isAuthenticated) return <LoginPage />;
return <Dashboard />;
```

### Common Pitfalls
- Using hooks outside `AgentuityProvider` throws an error
- `baseUrl` defaults to `window.location.origin` if not specified
- Auth header is automatically included in all `useAPI` and `useWebsocket` calls

### Checklist
- [ ] Wrap root component with `AgentuityProvider`
- [ ] Set `baseUrl` if API is on different origin
- [ ] Handle `authLoading` state during initial auth verification

---

## Using useAPI Hook

### When to Use
- Making HTTP requests to typed API routes
- Fetching data with automatic caching and refetching
- Submitting forms or triggering mutations
- Streaming responses from agents

### Core API

```typescript
import { useAPI } from '@agentuity/react';

// GET request - auto-executes on mount
const { data, isLoading, error, refetch } = useAPI('GET /users');

// POST request - manual invocation
const { invoke, data, isLoading } = useAPI('POST /users');
await invoke({ name: 'Alice', email: 'alice@example.com' });

// Alternative syntax with method/path
const { data } = useAPI({
  method: 'GET',
  path: '/users',
  query: { search: 'alice' }
});
```

**Full options:**
```typescript
const result = useAPI({
  route: 'GET /users',           // Route key from RouteRegistry
  query: { search: 'term' },     // Query parameters
  headers: { 'X-Custom': 'val' }, // Additional headers
  enabled: true,                  // Auto-fetch on mount (default: true for GET)
  staleTime: 5000,               // Data freshness in ms
  refetchInterval: 10000,        // Auto-refetch interval
  onSuccess: (data) => {},       // Success callback
  onError: (error) => {},        // Error callback
  // For streaming routes:
  delimiter: '\n',               // Chunk delimiter
  onChunk: (chunk) => chunk,     // Transform each chunk
});
```

**Return value:**
```typescript
interface UseAPIResult {
  data: T | undefined;      // Response data
  error: Error | null;      // Error if failed
  isLoading: boolean;       // First load in progress
  isFetching: boolean;      // Any fetch in progress
  isSuccess: boolean;       // Request succeeded
  isError: boolean;         // Request failed
  reset: () => void;        // Reset state
  refetch: () => Promise<void>;  // GET only
  invoke: (input) => Promise<T>; // POST/PUT/PATCH/DELETE only
}
```

### Key Patterns

**Streaming responses:**
```typescript
const { data, isLoading } = useAPI({
  route: 'POST /agent/chat',
  onChunk: (chunk) => {
    console.log('Received:', chunk);
    return chunk;
  }
});
// data is T[] for streaming routes (accumulated chunks)
```

**Conditional fetching:**
```typescript
const { data } = useAPI({
  route: 'GET /user/:id',
  enabled: !!userId,  // Only fetch when userId exists
  query: { id: userId }
});
```

**Form submission:**
```typescript
const { invoke, isLoading, isSuccess } = useAPI('POST /contact');

async function handleSubmit(formData) {
  try {
    await invoke(formData);
    showToast('Message sent!');
  } catch (error) {
    showToast('Failed to send');
  }
}
```

### Common Pitfalls
- GET requests cannot have `input` (use `query` instead)
- 204 No Content responses have no `data` property - check `isSuccess`
- Streaming routes return `T[]` not `T`
- Must be used within `AgentuityProvider`

### Checklist
- [ ] Use `invoke()` for mutations, `refetch()` for queries
- [ ] Handle `isLoading` state in UI
- [ ] Add error handling with `onError` or try/catch
- [ ] Set appropriate `staleTime` to reduce unnecessary requests

Reference: [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)

---

## Using useWebsocket Hook

### When to Use
- Real-time bidirectional communication
- Chat applications
- Live updates that require client-initiated messages
- Persistent connections with reconnection handling

### Core API

```typescript
import { useWebsocket } from '@agentuity/react';

const {
  isConnected,    // Connection status
  data,           // Most recent message
  messages,       // All received messages
  send,           // Send typed data
  close,          // Close connection
  clearMessages,  // Clear message history
  error,          // Connection error
  isError,        // Error occurred
  readyState,     // WebSocket.CONNECTING/OPEN/CLOSING/CLOSED
  reset           // Reset error state
} = useWebsocket('/chat');
```

**Options:**
```typescript
const ws = useWebsocket('/chat', {
  query: new URLSearchParams({ room: 'general' }),
  subpath: '/v2',
  signal: abortController.signal,
  maxMessages: 100  // Limit stored messages
});
```

### Key Patterns

**Chat application:**
```typescript
function Chat() {
  const { isConnected, messages, send } = useWebsocket('/chat');
  const [input, setInput] = useState('');

  const handleSend = () => {
    send({ message: input, timestamp: Date.now() });
    setInput('');
  };

  return (
    <div>
      <ConnectionStatus connected={isConnected} />
      <MessageList messages={messages} />
      <input value={input} onChange={e => setInput(e.target.value)} />
      <button onClick={handleSend} disabled={!isConnected}>Send</button>
    </div>
  );
}
```

**Handling reconnection:**
```typescript
const { isConnected, error, reset } = useWebsocket('/live');

useEffect(() => {
  if (error) {
    console.error('WebSocket error:', error);
    // Auto-reconnection is built-in with exponential backoff
  }
}, [error]);
```

### Common Pitfalls
- Auth token is passed via query string (WebSocket doesn't support headers)
- `data` only contains the most recent message; use `messages` for history
- Messages sent while disconnected are queued and sent on reconnect
- `close()` prevents auto-reconnection

### Checklist
- [ ] Handle `isConnected` state in UI
- [ ] Use `messages` array for complete history
- [ ] Set `maxMessages` to prevent memory issues in long sessions
- [ ] Handle errors gracefully (auto-reconnect is built-in)

Reference: [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)

---

## Managing React Agent State and Errors

### When to Use
- Building robust UIs with proper loading/error states
- Implementing error boundaries for agent failures
- Combining multiple API calls
- Optimistic updates

### Key Patterns

**Loading states:**
```typescript
function AgentPanel() {
  const { data, isLoading, isFetching } = useAPI('GET /agents');

  if (isLoading) return <Skeleton />;  // First load

  return (
    <div>
      {isFetching && <RefreshIndicator />}  // Background refresh
      <AgentList agents={data} />
    </div>
  );
}
```

**Error boundary pattern:**
```typescript
import { ErrorBoundary } from 'react-error-boundary';

function AgentErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert">
      <p>Agent error: {error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={AgentErrorFallback}>
      <AgentPanel />
    </ErrorBoundary>
  );
}
```

**Combining multiple hooks:**
```typescript
function Dashboard() {
  const users = useAPI('GET /users');
  const stats = useAPI('GET /stats');

  const isLoading = users.isLoading || stats.isLoading;
  const error = users.error || stats.error;

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return <DashboardView users={users.data} stats={stats.data} />;
}
```

**Optimistic updates:**
```typescript
function TodoItem({ todo }) {
  const [optimisticDone, setOptimisticDone] = useState(todo.done);
  const { invoke } = useAPI('PATCH /todos/:id');

  const toggleDone = async () => {
    const newState = !optimisticDone;
    setOptimisticDone(newState);  // Optimistic update

    try {
      await invoke({ id: todo.id, done: newState });
    } catch {
      setOptimisticDone(!newState);  // Rollback on error
    }
  };

  return <Checkbox checked={optimisticDone} onChange={toggleDone} />;
}
```

**Reset state after action:**
```typescript
const { invoke, reset, isSuccess } = useAPI('POST /message');

useEffect(() => {
  if (isSuccess) {
    showNotification('Sent!');
    reset();  // Clear state for next submission
  }
}, [isSuccess, reset]);
```

### Common Pitfalls
- Don't forget to handle both `isLoading` (first load) and `isFetching` (refetch)
- `error` persists until next successful request or `reset()` is called
- Streaming routes accumulate data in array - handle accordingly
- Auth changes trigger automatic refetches

### Checklist
- [ ] Show loading indicators for `isLoading` state
- [ ] Display errors from `error` property
- [ ] Implement error boundaries for catastrophic failures
- [ ] Use `reset()` to clear state between submissions
- [ ] Consider optimistic updates for better UX

Reference: [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)
