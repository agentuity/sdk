# Web Folder Guide

This folder contains your React-based web application that communicates with your Agentuity agents.

## Generated Types

The `src/generated/` folder contains auto-generated TypeScript files:

- `registry.ts` - Agent registry with input/output types

**Important:** Never edit files in `src/generated/` - they are overwritten on every build.

For type-safe API calls, use Hono's `hc()` client:

```typescript
import { hc } from 'hono/client';
import type { AppType } from '../api/router';

const client = hc<AppType>('/');
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
import { AgentuityProvider } from '@agentuity/react';
import { hc } from 'hono/client';
import type { AppType } from '../api/router';
import { useState } from 'react';

const client = hc<AppType>('/');

function HelloForm() {
	const [name, setName] = useState('World');
	const [greeting, setGreeting] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async () => {
		setIsLoading(true);
		const res = await client.api.hello.$post({ json: { name } });
		const data = await res.json();
		setGreeting(data.greeting);
		setIsLoading(false);
	};

	return (
		<div>
			<input
				type="text"
				value={name}
				onChange={(e) => setName(e.target.value)}
				disabled={isLoading}
			/>

			<button
				onClick={handleSubmit}
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

## Type-Safe API Calls

Use Hono's `hc()` client for type-safe API calls. The types are derived directly from your router.

```typescript
import { hc } from 'hono/client';
import type { AppType } from '../api/router';

// Create a typed client
const client = hc<AppType>('/');

// All routes are fully typed
const res = await client.api.users.$get();
const users = await res.json();

const res2 = await client.api.users.$post({ json: { name: 'Alice', email: 'alice@example.com' } });
const created = await res2.json();
```

For WebSocket and SSE, use the native browser APIs or `WebSocketManager`/`EventStreamManager` from `@agentuity/frontend`.

## React Hooks

`@agentuity/react` provides hooks for context, auth, WebRTC, and analytics. All hooks must be used within an `AgentuityProvider`.

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
import { AgentuityProvider } from '@agentuity/react';
import { hc } from 'hono/client';
import type { AppType } from '../api/router';
import { useState } from 'react';

const client = hc<AppType>('/');

function Dashboard() {
	const [count, setCount] = useState(0);
	const [result, setResult] = useState<any>(null);

	const handleProcess = async () => {
		const res = await client.api.process.$post({ json: { name: 'Jeff', age: 30 } });
		setResult(await res.json());
	};

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
				<button onClick={handleProcess}>
					Call API
				</button>
				<p>{JSON.stringify(result)}</p>
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

## Best Practices

- Wrap your app with **AgentuityProvider** for auth and context
- Use **hc()** from `hono/client` for type-safe API calls
- Use **useAuth** for authentication state management
- Handle loading and error states in UI
- Place reusable components in separate files
- Keep static assets in the **public/** folder

## Rules

- **App.tsx** must export a function named `App`
- **frontend.tsx** must render the `App` component to `#root`
- **index.html** must have a `<div id="root"></div>`
- Route types are derived from your Hono router via `hc<typeof router>()`
- The web app is served at `/` by default
- Static files in `public/` are served at `/public/*`
- Module script tag: `<script type="module" src="/web/frontend.tsx"></script>`
