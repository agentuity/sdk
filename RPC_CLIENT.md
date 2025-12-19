# RPC Client System

The Agentuity SDK provides a type-safe RPC client for calling routes from React applications. The client automatically generates TypeScript types from your route definitions and provides an ergonomic API for all route types (API, WebSocket, SSE).

## Quick Start

### 1. Import `createAPIClient` from generated routes

```typescript
import { createAPIClient } from './generated/routes';

const api = createAPIClient();
```

### 2. Call routes with full type safety

```typescript
// API calls
const result = await api.hello.post({ name: 'World' });

// WebSocket
const ws = api.echo.websocket();
ws.on('message', (data) => console.log(data));
ws.send({ message: 'Hello' });

// Server-Sent Events
const es = api.events.eventstream();
es.on('message', (event) => console.log(event.data));
```

## API Reference

### `createAPIClient(options?)`

Creates a type-safe RPC client with optional configuration.

**Parameters:**

- `options` (optional): Configuration object
   - `headers`: Static headers or function returning headers
   - `baseUrl`: Override base URL (string or function)
   - `contentType`: Content-Type header (default: `'application/json'`)
   - `signal`: AbortSignal for request cancellation

**Returns:** Typed client matching your route registry

**Example:**

```typescript
// Basic usage
const api = createAPIClient();

// With custom headers
const api = createAPIClient({
	headers: { 'X-Custom-Header': 'value' },
});

// With dynamic headers
const api = createAPIClient({
	headers: () => ({ 'X-Request-ID': generateId() }),
});
```

## Authentication

The RPC client automatically includes authentication headers when used with `AgentuityProvider`:

```typescript
// In your app root
import { AgentuityProvider } from '@agentuity/react';
import { AgentuityClerk } from '@agentuity/auth/clerk';
import { useAuth } from '@clerk/clerk-react';

function App() {
  return (
    <AgentuityProvider baseUrl="https://your-api.com">
      <AgentuityClerk useAuth={useAuth}>
        <YourApp />
      </AgentuityClerk>
    </AgentuityProvider>
  );
}

// In your components - auth is automatic!
function YourComponent() {
  const api = createAPIClient();

  // Authorization header automatically included
  const result = await api.hello.post({ name: 'World' });
}
```

### How Auth Works

1. Auth provider (Clerk, Auth0, etc.) sets token via `setGlobalAuthHeader()`
2. `AgentuityProvider` syncs the auth header to global state
3. `createAPIClient()` automatically includes the `Authorization` header in all requests
4. Token is fetched fresh for each request (handles token refresh automatically)

## Route Types

### API Routes

Regular HTTP API calls. The method name (`.post()`, `.get()`, etc.) is at the end of the chain.

```typescript
// POST request
const result = await api.users.create.post({ name: 'Alice', email: 'alice@example.com' });

// GET request
const users = await api.users.list.get();

// PUT request
await api.users.update.put({ id: '123', name: 'Bob' });

// DELETE request
await api.users.delete.delete({ id: '123' });
```

### WebSocket Routes

WebSocket connections for bidirectional real-time communication.

```typescript
const ws = api.chat.websocket();

// Listen for events
ws.on('open', (event) => console.log('Connected'));
ws.on('message', (data) => console.log('Received:', data));
ws.on('close', (event) => console.log('Disconnected'));
ws.on('error', (event) => console.error('Error:', event));

// Send messages
ws.send({ type: 'chat', message: 'Hello!' });

// Close connection
ws.close();
```

### Server-Sent Events (SSE)

Server-initiated event streaming for one-way real-time updates.

```typescript
const es = api.notifications.eventstream();

// Listen for events
es.on('open', (event) => console.log('Stream opened'));
es.on('message', (event) => {
	console.log('Event:', event.data);
});
es.on('error', (event) => console.error('Error:', event));

// Close stream
es.close();
```

### Streaming Routes

Binary streaming for file downloads or data streaming.

```typescript
const stream = await api.data.export.stream({ format: 'csv' });

stream.on('chunk', (chunk: Uint8Array) => {
	console.log('Chunk:', chunk);
});

stream.on('close', () => {
	console.log('Stream complete');
});

stream.on('error', (error) => {
	console.error('Stream error:', error);
});

// Cancel stream
await stream.cancel();
```

## Type Safety

The RPC client provides full end-to-end type safety:

### Input Validation

```typescript
// TypeScript error: missing required field
await api.users.create.post({ name: 'Alice' }); // ❌ Error: missing 'email'

// TypeScript error: wrong type
await api.users.create.post({ name: 123, email: 'alice@example.com' }); // ❌ Error: name must be string

// Correct
await api.users.create.post({ name: 'Alice', email: 'alice@example.com' }); // ✅
```

### Output Types

```typescript
// TypeScript knows the exact return type
const result = await api.users.get.post({ id: '123' });
result.name; // ✅ string
result.email; // ✅ string
result.invalidProp; // ❌ TypeScript error
```

### Method Type Safety

```typescript
// Only valid methods are available
api.hello.post(); // ✅
api.hello.invalidMethod(); // ❌ TypeScript error

// Stream methods only on stream routes
api.echo.websocket(); // ✅ (WebSocket route)
api.hello.websocket(); // ❌ TypeScript error (API route)
```

## Advanced Usage

### Custom Headers Per Request

Override headers for specific requests:

```typescript
const api = createAPIClient({
	headers: () => ({
		'X-Request-ID': Math.random().toString(),
		'X-Tenant-ID': getCurrentTenant(),
	}),
});
```

### Base URL Override

```typescript
// Static base URL
const api = createAPIClient({ baseUrl: 'https://api.staging.com' });

// Dynamic base URL
const api = createAPIClient({
	baseUrl: () => getEnvironmentURL(),
});
```

### Request Cancellation

```typescript
const controller = new AbortController();

const api = createAPIClient({ signal: controller.signal });

// Start request
const promise = api.longRunning.post({ data: 'large' });

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
	await promise;
} catch (error) {
	if (error.name === 'AbortError') {
		console.log('Request cancelled');
	}
}
```

### Multiple API Instances

Create multiple clients for different configurations:

```typescript
// Public API (no auth)
const publicApi = createAPIClient({ baseUrl: 'https://api.example.com' });

// Admin API (with special headers)
const adminApi = createAPIClient({
	baseUrl: 'https://admin.example.com',
	headers: { 'X-Admin-Key': process.env.ADMIN_KEY },
});
```

## Error Handling

The RPC client throws errors for failed requests:

```typescript
try {
	const result = await api.users.create.post({ name: 'Alice', email: 'invalid' });
} catch (error) {
	console.error('Request failed:', error.message);
	// HTTP 400: Bad Request
}
```

### ServiceException

Errors are instances of `ServiceException` with structured data:

```typescript
import { ServiceException } from '@agentuity/core';

try {
	await api.users.get.post({ id: 'invalid' });
} catch (error) {
	if (error instanceof ServiceException) {
		console.log('Status:', error.statusCode); // 404
		console.log('Method:', error.method); // 'POST'
		console.log('URL:', error.url); // '/api/users/get'
	}
}
```

## Generated Code

The RPC client is generated from your route definitions. The generator creates:

### 1. Type Registry

```typescript
declare module '@agentuity/react' {
	export interface RPCRouteRegistry {
		hello: {
			post: { input: { name: string }; output: string; type: 'api' };
		};
		echo: {
			websocket: { input: { message: string }; output: { echo: string }; type: 'websocket' };
		};
	}
}
```

### 2. Runtime Metadata

```typescript
const _rpcRouteMetadata = {
	hello: {
		post: { type: 'api' },
	},
	echo: {
		websocket: { type: 'websocket' },
	},
} as const;
```

### 3. createAPIClient Function

```typescript
export function createAPIClient(options) {
	return createClient(options || {}, _rpcRouteMetadata);
}
```

## Best Practices

### 1. Create Client Once

Create the API client once and reuse it:

```typescript
// ✅ Good: Create once at module level
const api = createAPIClient();

export function MyComponent() {
	const result = await api.hello.post({ name: 'World' });
}

// ❌ Bad: Creating on every render
export function MyComponent() {
	const api = createAPIClient(); // Don't do this!
	const result = await api.hello.post({ name: 'World' });
}
```

### 2. Use TypeScript

Always use TypeScript to get full type safety:

```typescript
// types.ts
export interface User {
	id: string;
	name: string;
	email: string;
}

// component.tsx
const user: User = await api.users.get.post({ id: '123' });
```

### 3. Handle Errors

Always handle errors appropriately:

```typescript
async function createUser(data) {
	try {
		return await api.users.create.post(data);
	} catch (error) {
		// Log error
		console.error('Failed to create user:', error);

		// Show user-friendly message
		toast.error('Could not create user. Please try again.');

		// Re-throw or return default
		throw error;
	}
}
```

### 4. Clean Up Streams

Always clean up WebSocket and SSE connections:

```typescript
useEffect(() => {
	const ws = api.chat.websocket();

	ws.on('message', handleMessage);

	// Cleanup on unmount
	return () => ws.close();
}, []);
```

## Troubleshooting

### "createAPIClient is not a function"

Make sure you're importing from the generated routes file:

```typescript
// ❌ Wrong
import { createAPIClient } from '@agentuity/react';

// ✅ Correct
import { createAPIClient } from './generated/routes';
```

### "Property 'X' does not exist"

The route doesn't exist or hasn't been generated. Rebuild your project:

```bash
bun run build
```

### TypeScript Errors on `.websocket()` or `.eventstream()`

Make sure the route is defined as a WebSocket or SSE route, not a regular API route.

### Auth Headers Not Included

Make sure you're using `AgentuityProvider` and an auth provider:

```typescript
<AgentuityProvider>
  <AgentuityClerk useAuth={useAuth}>
    <App />
  </AgentuityClerk>
</AgentuityProvider>
```

## Migration Guide

### From `useAPI` Hook

**Before:**

```typescript
const { data, run } = useAPI('hello.post');
const result = await run({ name: 'World' });
```

**After:**

```typescript
const api = createAPIClient();
const result = await api.hello.post({ name: 'World' });
```

### From `useWebsocket` Hook

**Before:**

```typescript
const { send, messages } = useWebsocket('/api/echo');
send({ message: 'Hello' });
```

**After:**

```typescript
const ws = api.echo.websocket();
ws.on('message', (data) => console.log(data));
ws.send({ message: 'Hello' });
```

### From `useEventStream` Hook

**Before:**

```typescript
const { data } = useEventStream('/api/events');
```

**After:**

```typescript
const es = api.events.eventstream();
es.on('message', (event) => console.log(event.data));
```

## Related Documentation

- [React Package](./packages/react/AGENTS.md) - React hooks and components
- [Core Package](./packages/core/AGENTS.md) - Core client implementation
- [CLI Package](./packages/cli/AGENTS.md) - Code generation and build system
- [Auth Package](./packages/auth/AGENTS.md) - Authentication integration
