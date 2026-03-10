---
name: agentuity-frontend
description: When working with Agentuity SDK frontend packages including @agentuity/react, @agentuity/frontend, @agentuity/auth, or @agentuity/workbench. Activates when building React components that call agents, setting up authentication, using WebRTC hooks, or integrating the workbench dev UI.
version: 1.0.0
---

# Agentuity Frontend Reference

Deep reference material for the Agentuity SDK frontend packages used to build web applications, React integrations, and authentication.

## Package Overview

| Package                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `@agentuity/react`     | React hooks for context, auth, WebRTC, and analytics |
| `@agentuity/frontend`  | Framework-agnostic web utilities                      |
| `@agentuity/auth`      | Authentication (server + client)                      |
| `@agentuity/workbench` | Dev UI for testing agents                             |

## Reference URLs

When uncertain, look up:

- **SDK Source**: https://github.com/agentuity/sdk/tree/main/packages
- **Docs**: https://agentuity.dev
- **React Package**: https://github.com/agentuity/sdk/tree/main/packages/react/src
- **Auth Package**: https://github.com/agentuity/sdk/tree/main/packages/auth/src

---

## @agentuity/react

React hooks and components for Agentuity web applications.

### Setup with AgentuityProvider

```tsx
import { AgentuityProvider } from '@agentuity/react';

function App() {
	return (
		<AgentuityProvider>
			<MyApp />
		</AgentuityProvider>
	);
}
```

NOTE: The `baseUrl="http://localhost:3000"` property is only needed if using outside an Agentuity full stack project.

### Type-Safe API Calls

Use Hono's `hc()` client for type-safe API calls:

```tsx
import { hc } from 'hono/client';
import type { AppType } from '../api/router';

const client = hc<AppType>('/');

function ChatComponent() {
	const [data, setData] = useState(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (message: string) => {
		setIsLoading(true);
		const res = await client.api.chat.$post({ json: { message } });
		setData(await res.json());
		setIsLoading(false);
	};

	return (
		<div>
			{isLoading && <p>Loading...</p>}
			{data && <p>Response: {data.reply}</p>}
			<button onClick={() => handleSubmit('Hello!')}>Send</button>
		</div>
	);
}
```

For WebSocket and SSE, use `WebSocketManager` and `EventStreamManager` from `@agentuity/frontend`.

### useAuth Hook

Access authentication state.

```tsx
import { useAuth } from '@agentuity/react';

function UserProfile() {
	const { isAuthenticated, authLoading, authHeader } = useAuth();

	if (authLoading) return <p>Loading...</p>;
	if (!isAuthenticated) return <p>Please sign in</p>;

	return <p>Welcome back!</p>;
}
```

**Note:** Auth tokens can be accessed via `useAuth()` and passed to API calls manually.

---

## @agentuity/auth

First-class authentication for Agentuity projects, powered by BetterAuth.

### Server Setup

```typescript
import { createAuth, createSessionMiddleware, mountAuthRoutes } from '@agentuity/auth';
import { createRouter } from '@agentuity/runtime';

// Create auth instance
const auth = createAuth({
	connectionString: process.env.DATABASE_URL,
	// Optional: custom base path (default: /api/auth)
	basePath: '/api/auth',
});

const router = createRouter();

// Mount auth routes (handles sign-in, sign-up, etc.)
router.on(['GET', 'POST'], '/api/auth/*', mountAuthRoutes(auth));

// Protect routes with session middleware
router.use('/api/*', createSessionMiddleware(auth));
```

### Agent Handler (ctx.auth)

When using auth middleware, `ctx.auth` is available in agent handlers:

```typescript
import { createAgent } from '@agentuity/runtime';

export default createAgent('protected-agent', {
	handler: async (ctx, input) => {
		// ctx.auth is null for unauthenticated requests
		if (!ctx.auth) {
			return { error: 'Please sign in' };
		}

		// Get authenticated user
		const user = await ctx.auth.getUser();
		return { message: `Hello ${user.name}` };
	},
});
```

### Client Setup (React)

```tsx
import { AuthProvider } from '@agentuity/react';

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

### Integration with @agentuity/drizzle

```typescript
import { createPostgresDrizzle, drizzleAdapter } from '@agentuity/drizzle';
import { createAuth } from '@agentuity/auth';
import * as schema from './schema';

const { db, close } = createPostgresDrizzle({ schema });

const auth = createAuth({
	database: drizzleAdapter(db, { provider: 'pg' }),
});
```

---

## @agentuity/frontend

Framework-agnostic utilities for web applications.

- URL building for API endpoints
- Reconnection manager for WebSocket connections
- Shared utilities used by @agentuity/react

---

## @agentuity/workbench

Dev UI for testing agents during development.

```typescript
// In your main entry point
import { welcome } from '@agentuity/workbench';

// Export welcome to enable the workbench
export { welcome };
```

The workbench provides a testing interface for your agents during local development (`bun run dev`).

---

## Common Patterns

### Full-Stack Setup

```
src/
├── agent/<name>/    # Agent handlers (backend)
│   ├── agent.ts
│   └── index.ts
├── api/             # API routes (Hono)
│   └── index.ts
└── web/             # React frontend
    ├── App.tsx
    ├── index.tsx
    └── components/
```

### Auth + Agent Call Pattern

```tsx
import { AuthProvider, AgentuityProvider, useAuth } from '@agentuity/react';
import { hc } from 'hono/client';
import type { AppType } from '../api/router';

const client = hc<AppType>('/');

function App() {
	return (
		<AuthProvider>
			<AgentuityProvider>
				<ProtectedChat />
			</AgentuityProvider>
		</AuthProvider>
	);
}

function ProtectedChat() {
	const { isAuthenticated, authHeader } = useAuth();
	const [data, setData] = useState(null);

	if (!isAuthenticated) return <SignIn />;

	const handleChat = async () => {
		const res = await client.api.chat.$post(
			{ json: { message: 'Hello' } },
			{ headers: authHeader ? { Authorization: authHeader } : {} }
		);
		setData(await res.json());
	};

	return (
		<div>
			<button onClick={handleChat}>Chat</button>
			{data && <p>{data.reply}</p>}
		</div>
	);
}
```

## Common Mistakes

| Mistake                                   | Better Approach                | Why                                  |
| ----------------------------------------- | ------------------------------ | ------------------------------------ |
| Adding `baseUrl` inside Agentuity project | Omit `baseUrl`                 | Auto-detected in full-stack projects |
| Missing AuthProvider                      | Wrap app with AuthProvider     | Required for auth token injection    |
| Not passing auth headers to hc() calls    | Use `useAuth()` + headers opt  | Auth tokens not auto-injected        |
