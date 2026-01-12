# Web Folder Guide

This folder contains your React-based web application that communicates with your Agentuity agents.

## Generated Types

The `src/generated/` folder contains auto-generated TypeScript files:

- `routes.ts` - Route registry with type-safe API, WebSocket, and SSE route definitions
- `registry.ts` - Agent registry with input/output types

**Important:** Never edit files in `src/generated/` - they are overwritten on every build.

Import generated types in your components:

```typescript
// Routes are typed automatically via module augmentation
import { useAPI } from '@agentuity/react';

// The route 'GET /api/users' is fully typed
const { data } = useAPI('GET /api/users');
```

## Directory Structure

Required files:

- **App.tsx** (required) - Main React application component
- **frontend.tsx** (required) - Frontend entry point with client-side rendering
- **index.html** (required) - HTML template
- **public/** (optional) - Static assets (images, CSS, JS files)

Example structure:

```
src/web/
├── App.tsx
├── frontend.tsx
├── index.html
└── public/
    ├── styles.css
    ├── logo.svg
    └── script.js
```

## Creating the Web App

### App.tsx - Main Component

```typescript
import { AgentuityProvider, useAPI } from '@agentuity/react';
import { useState } from 'react';

function HelloForm() {
	const [name, setName] = useState('World');
	const { invoke, isLoading, data: greeting } = useAPI('POST /api/hello');

	return (
		<div>
			<input
				type="text"
				value={name}
				onChange={(e) => setName(e.target.value)}
				disabled={isLoading}
			/>

			<button
				onClick={() => invoke({ name })}
				disabled={isLoading}
			>
				{isLoading ? 'Running...' : 'Say Hello'}
			</button>

			<div>{greeting ?? 'Waiting for response'}</div>
		</div>
	);
}

export function App() {
	return (
		<AgentuityProvider>
			<div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
				<h1>Welcome to Agentuity</h1>
				<HelloForm />
			</div>
		</AgentuityProvider>
	);
}
```

### frontend.tsx - Entry Point

```typescript
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(<App />);
```

### index.html - HTML Template

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>My Agentuity App</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/web/frontend.tsx"></script>
	</body>
</html>
```

## React Hooks

All hooks from `@agentuity/react` must be used within an `AgentuityProvider`. **Always use these hooks instead of raw `fetch()` calls** - they provide type safety, automatic error handling, and integration with the Agentuity platform.

### useAPI - Type-Safe API Calls

The primary hook for making HTTP requests. **Use this instead of `fetch()`.**

```typescript
import { useAPI } from '@agentuity/react';

function MyComponent() {
	// GET requests auto-execute and return refetch
	const { data, isLoading, error, refetch } = useAPI('GET /api/users');

	// POST/PUT/DELETE return invoke for manual execution
	const { invoke, data: result, isLoading: saving } = useAPI('POST /api/users');

	const handleCreate = async () => {
		// Input is fully typed from route schema!
		await invoke({ name: 'Alice', email: 'alice@example.com' });
	};

	return (
		<div>
			<button onClick={handleCreate} disabled={saving}>
				{saving ? 'Creating...' : 'Create User'}
			</button>
			{result && <p>Created: {result.name}</p>}
		</div>
	);
}
```

**useAPI Return Values:**

| Property     | Type                     | Description                               |
| ------------ | ------------------------ | ----------------------------------------- |
| `data`       | `T \| undefined`         | Response data (typed from route schema)   |
| `error`      | `Error \| null`          | Error if request failed                   |
| `isLoading`  | `boolean`                | True during initial load                  |
| `isFetching` | `boolean`                | True during any fetch (including refetch) |
| `isSuccess`  | `boolean`                | True if last request succeeded            |
| `isError`    | `boolean`                | True if last request failed               |
| `invoke`     | `(input?) => Promise<T>` | Manual trigger (POST/PUT/DELETE)          |
| `refetch`    | `() => Promise<void>`    | Refetch data (GET)                        |
| `reset`      | `() => void`             | Reset state to initial                    |

### useAPI Options

```typescript
// GET with query parameters and caching
const { data } = useAPI({
	route: 'GET /api/search',
	query: { q: 'react', limit: '10' },
	staleTime: 5000, // Cache for 5 seconds
	refetchInterval: 10000, // Auto-refetch every 10 seconds
	enabled: true, // Set to false to disable auto-fetch
});

// POST with callbacks
const { invoke } = useAPI({
	route: 'POST /api/users',
	onSuccess: (data) => console.log('Created:', data),
	onError: (error) => console.error('Failed:', error),
});

// Streaming responses with onChunk
const { invoke } = useAPI({
	route: 'POST /api/stream',
	onChunk: (chunk) => console.log('Received chunk:', chunk),
	delimiter: '\n', // Split stream by newlines (default)
});

// Custom headers
const { data } = useAPI({
	route: 'GET /api/protected',
	headers: { 'X-Custom-Header': 'value' },
});
```

### useWebsocket - WebSocket Connection

For bidirectional real-time communication. Automatically handles reconnection.

```typescript
import { useWebsocket } from '@agentuity/react';

function ChatComponent() {
	const { isConnected, data, send, messages, clearMessages, error, reset } = useWebsocket('/api/chat');

	return (
		<div>
			<p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
			<button onClick={() => send({ message: 'Hello' })}>Send</button>
			<div>
				{messages.map((msg, i) => (
					<p key={i}>{JSON.stringify(msg)}</p>
				))}
			</div>
			<button onClick={clearMessages}>Clear</button>
		</div>
	);
}
```

**useWebsocket Return Values:**

| Property        | Type             | Description                              |
| --------------- | ---------------- | ---------------------------------------- |
| `isConnected`   | `boolean`        | True when WebSocket is connected         |
| `data`          | `T \| undefined` | Most recent message received             |
| `messages`      | `T[]`            | Array of all received messages           |
| `send`          | `(data) => void` | Send a message (typed from route schema) |
| `clearMessages` | `() => void`     | Clear the messages array                 |
| `close`         | `() => void`     | Close the connection                     |
| `error`         | `Error \| null`  | Error if connection failed               |
| `isError`       | `boolean`        | True if there's an error                 |
| `reset`         | `() => void`     | Reset state and reconnect                |
| `readyState`    | `number`         | WebSocket ready state                    |

### useEventStream - Server-Sent Events

For server-to-client streaming (one-way). Use when server pushes updates to client.

```typescript
import { useEventStream } from '@agentuity/react';

function NotificationsComponent() {
	const { isConnected, data, error, close, reset } = useEventStream('/api/notifications');

	return (
		<div>
			<p>Connected: {isConnected ? 'Yes' : 'No'}</p>
			{error && <p>Error: {error.message}</p>}
			<p>Latest: {JSON.stringify(data)}</p>
			<button onClick={close}>Disconnect</button>
		</div>
	);
}
```

**useEventStream Return Values:**

| Property      | Type             | Description                        |
| ------------- | ---------------- | ---------------------------------- |
| `isConnected` | `boolean`        | True when EventSource is connected |
| `data`        | `T \| undefined` | Most recent event data             |
| `error`       | `Error \| null`  | Error if connection failed         |
| `isError`     | `boolean`        | True if there's an error           |
| `close`       | `() => void`     | Close the connection               |
| `reset`       | `() => void`     | Reset state and reconnect          |
| `readyState`  | `number`         | EventSource ready state            |

### useAgentuity - Access Context

Access the Agentuity context for base URL and configuration.

```typescript
import { useAgentuity } from '@agentuity/react';

function MyComponent() {
	const { baseUrl } = useAgentuity();

	return <p>API Base: {baseUrl}</p>;
}
```

### useAuth - Authentication State

Access and manage authentication state.

```typescript
import { useAuth } from '@agentuity/react';

function AuthStatus() {
	const { isAuthenticated, authHeader, setAuthHeader, authLoading } = useAuth();

	const handleLogin = async (token: string) => {
		setAuthHeader?.(`Bearer ${token}`);
	};

	const handleLogout = () => {
		setAuthHeader?.(null);
	};

	if (authLoading) return <p>Loading...</p>;

	return (
		<div>
			{isAuthenticated ? (
				<button onClick={handleLogout}>Logout</button>
			) : (
				<button onClick={() => handleLogin('my-token')}>Login</button>
			)}
		</div>
	);
}
```

**useAuth Return Values:**

| Property          | Type                | Description                                 |
| ----------------- | ------------------- | ------------------------------------------- |
| `isAuthenticated` | `boolean`           | True if user has auth token and not loading |
| `authHeader`      | `string \| null`    | Current auth header (e.g., "Bearer ...")    |
| `setAuthHeader`   | `(token) => void`   | Set auth header (null to clear)             |
| `authLoading`     | `boolean`           | True during auth state changes              |
| `setAuthLoading`  | `(loading) => void` | Set auth loading state                      |

## Complete Example

```typescript
import { AgentuityProvider, useAPI, useWebsocket } from '@agentuity/react';
import { useEffect, useState } from 'react';

function Dashboard() {
	const [count, setCount] = useState(0);
	const { invoke, data: agentResult } = useAPI('POST /api/process');
	const { isConnected, send, data: wsMessage } = useWebsocket('/api/live');

	useEffect(() => {
		if (isConnected) {
			const interval = setInterval(() => {
				send({ ping: Date.now() });
			}, 1000);
			return () => clearInterval(interval);
		}
	}, [isConnected, send]);

	return (
		<div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
			<h1>My Agentuity App</h1>

			<div>
				<p>Count: {count}</p>
				<button onClick={() => setCount(c => c + 1)}>
					Increment
				</button>
			</div>

			<div>
				<button onClick={() => invoke({ name: 'Jeff', age: 30 })}>
					Call API
				</button>
				<p>{JSON.stringify(agentResult)}</p>
			</div>

			<div>
				<strong>WebSocket:</strong>
				{isConnected ? JSON.stringify(wsMessage) : 'Not connected'}
			</div>
		</div>
	);
}

export function App() {
	return (
		<AgentuityProvider>
			<Dashboard />
		</AgentuityProvider>
	);
}
```

## Static Assets

Place static files in the **public/** folder:

```
src/web/public/
├── logo.svg
├── styles.css
└── script.js
```

Reference them in your HTML or components:

```html
<!-- In index.html -->
<link rel="stylesheet" href="/public/styles.css" />
<script src="/public/script.js"></script>
```

```typescript
// In React components
<img src="/public/logo.svg" alt="Logo" />
```

## Styling

### Inline Styles

```typescript
<div style={{ backgroundColor: '#000', color: '#fff', padding: '1rem' }}>
	Styled content
</div>
```

### CSS Files

Create `public/styles.css`:

```css
body {
	background-color: #09090b;
	color: #fff;
	font-family: sans-serif;
}
```

Import in `index.html`:

```html
<link rel="stylesheet" href="/public/styles.css" />
```

### Style Tag in Component

```typescript
<div>
	<button className="glow-btn">Click me</button>
	<style>{`
		.glow-btn {
			background: linear-gradient(to right, #155e75, #3b82f6);
			border: none;
			padding: 0.75rem 1.5rem;
			color: white;
			cursor: pointer;
		}
	`}</style>
</div>
```

## RPC-Style API Client

For non-React contexts (like utility functions or event handlers), use `createClient`:

```typescript
import { createClient } from '@agentuity/react';

// Create a typed client (uses global baseUrl and auth from AgentuityProvider)
const api = createClient();

// Type-safe RPC-style calls - routes become nested objects
// Route 'GET /api/users' becomes api.users.get()
// Route 'POST /api/users' becomes api.users.post()
// Route 'GET /api/users/:id' becomes api.users.id.get({ id: '123' })

async function fetchData() {
	const users = await api.users.get();
	const newUser = await api.users.post({ name: 'Alice', email: 'alice@example.com' });
	const user = await api.users.id.get({ id: '123' });
	return { users, newUser, user };
}
```

**When to use `createClient` vs `useAPI`:**

| Use Case                  | Recommendation |
| ------------------------- | -------------- |
| React component rendering | `useAPI` hook  |
| Event handlers            | Either works   |
| Utility functions         | `createClient` |
| Non-React code            | `createClient` |
| Need loading/error state  | `useAPI` hook  |
| Need caching/refetch      | `useAPI` hook  |

## Best Practices

- Wrap your app with **AgentuityProvider** for hooks to work
- **Always use `useAPI` instead of `fetch()`** for type safety and error handling
- Use **useAPI** for type-safe HTTP requests (GET, POST, PUT, DELETE)
- Use **useWebsocket** for bidirectional real-time communication
- Use **useEventStream** for server-to-client streaming
- Use **useAuth** for authentication state management
- Handle loading and error states in UI
- Place reusable components in separate files
- Keep static assets in the **public/** folder

## Rules

- **App.tsx** must export a function named `App`
- **frontend.tsx** must render the `App` component to `#root`
- **index.html** must have a `<div id="root"></div>`
- Routes are typed via module augmentation from `src/generated/routes.ts`
- The web app is served at `/` by default
- Static files in `public/` are served at `/public/*`
- Module script tag: `<script type="module" src="/web/frontend.tsx"></script>`
- **Never use raw `fetch()` calls** - always use `useAPI` or `createClient`

<!-- prompt_hash: 8b53bca757470f12c19fbe0fbeeccb603e3950e3e207ca9c047219bab637d0ff -->
