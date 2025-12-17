# @agentuity/auth

Drop-in authentication helpers for popular identity providers (Clerk, WorkOS, Auth0, Better Auth, etc.).

## Features

- ✅ **Zero Configuration**: Drop-in components that work out of the box
- ✅ **Provider Agnostic**: Generic interfaces allow routes to be provider-independent
- ✅ **Tree Shakeable**: Import only the providers you use (`@agentuity/auth/clerk`)
- ✅ **Type Safe**: Full TypeScript support with proper type inference
- ✅ **Automatic Token Injection**: Seamless integration with `useAPI` and `useWebsocket`
- ✅ **Server Validation**: Easy middleware for token validation and user context

## Installation

```bash
bun add @agentuity/auth
```

## Supported Providers

- **Clerk** - `@agentuity/auth/clerk`
- WorkOS - Coming soon
- Auth0 - Coming soon
- Better Auth - Coming soon

## Quick Start

### Clerk Integration

#### 1. Install Clerk

```bash
bun add @clerk/clerk-react @clerk/backend
```

#### 2. Client Setup (React)

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { AgentuityProvider } from '@agentuity/react';
import { AgentuityClerk } from '@agentuity/auth/clerk';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ClerkProvider publishableKey={process.env.AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
			<AgentuityProvider>
				<AgentuityClerk useAuth={useAuth}>
					<App />
				</AgentuityClerk>
			</AgentuityProvider>
		</ClerkProvider>
	</React.StrictMode>
);
```

#### 3. Server Setup (Hono)

```typescript
import { createRouter } from '@agentuity/runtime';
import { createMiddleware } from '@agentuity/auth/clerk';

const router = createRouter();

// Protected route
router.get('/profile', createMiddleware(), async (c) => {
	const user = await c.var.auth.requireUser();
	return c.json({
		id: user.id,
		name: user.name,
		email: user.email,
	});
});

export default router;
```

#### 4. Environment Variables

Create a `.env` file:

```env
# Client-side (bundled into frontend)
AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Server-side (kept secret)
CLERK_SECRET_KEY=sk_test_...
```

Get your keys from [Clerk Dashboard](https://dashboard.clerk.com).

## Usage

### Client Side

Once you wrap your app with `AgentuityClerk`, all `useAPI` and `useWebsocket` calls automatically include the auth token:

```tsx
import { useAPI, useAuth } from '@agentuity/react';

function MyComponent() {
	const { isAuthenticated, authLoading } = useAuth();
	const { data, invoke } = useAPI('POST /api/users');

	if (authLoading) {
		return <div>Loading...</div>;
	}

	if (!isAuthenticated) {
		return <div>Please sign in</div>;
	}

	return <button onClick={() => invoke({ name: 'Alice' })}>Create User</button>;
}
```

### Server Side

#### Basic Protection

```typescript
import { createMiddleware } from '@agentuity/auth/clerk';

// Protect a single route
router.post('/admin', createMiddleware(), async (c) => {
	const user = await c.var.auth.requireUser();
	return c.json({ admin: true, userId: user.id });
});
```

#### Global Middleware

```typescript
// Protect all routes under /api
router.use('/api/*', createMiddleware());

router.get('/api/profile', async (c) => {
	const user = await c.var.auth.requireUser();
	return c.json({ email: user.email });
});
```

#### Access Provider-Specific Data

```typescript
router.get('/profile', createMiddleware(), async (c) => {
	const user = await c.var.auth.requireUser();

	// Access generic fields
	console.log(user.id, user.email, user.name);

	// Access Clerk-specific fields (fully typed)
	const clerkUser = user.raw; // Type: User from @clerk/backend
	console.log(clerkUser.imageUrl);
	console.log(clerkUser.publicMetadata);

	// Access JWT payload
	const payload = c.var.auth.raw; // Type: ClerkJWTPayload
	console.log(payload.sub);

	return c.json({ user });
});
```

#### Custom Middleware Options

```typescript
import { createMiddleware } from '@agentuity/auth/clerk';

router.use(
	'/api/*',
	createMiddleware({
		secretKey: 'custom-secret',
		publishableKey: 'custom-publishable',
		getToken: (authHeader) => authHeader.replace('Custom ', ''),
	})
);
```

## API Reference

### Client Components

#### `AgentuityClerk`

React component that integrates Clerk with Agentuity context.

**Props:**

- `useAuth: UseAuth` - Clerk's `useAuth` hook from `@clerk/clerk-react`
- `children: React.ReactNode` - Your app components
- `refreshInterval?: number` - Token refresh interval in ms (default: 60000)

**Example:**

```tsx
<AgentuityClerk useAuth={useAuth} refreshInterval={30000}>
	<App />
</AgentuityClerk>
```

### Server Middleware

#### `createMiddleware(options?)`

Creates Hono middleware for Clerk authentication.

**Options:**

- `secretKey?: string` - Clerk secret key (defaults to `process.env.CLERK_SECRET_KEY`)
- `publishableKey?: string` - Clerk publishable key (defaults to `process.env.AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY` or `process.env.CLERK_PUBLISHABLE_KEY`)
- `getToken?: (authHeader: string) => string` - Custom token extractor

**Returns:** Hono `MiddlewareHandler`

**Behavior:**

- Returns 401 if Authorization header is missing
- Returns 401 if token is invalid
- Sets `c.var.auth` with authenticated user context

### Context Hooks

#### `useAuth()`

Hook to access authentication state (from `@agentuity/react`).

**Returns:**

```typescript
{
  authHeader?: string | null;
  authLoading?: boolean;
  isAuthenticated: boolean; // Convenience: !authLoading && authHeader !== null
  setAuthHeader?: (token: string | null) => void;
  setAuthLoading?: (loading: boolean) => void;
}
```

#### `useAgentuity()`

Hook to access Agentuity context (non-auth properties only, from `@agentuity/react`).

**Returns:**

```typescript
{
	baseUrl: string;
}
```

### Types

#### `AgentuityAuthUser<T>`

Generic authenticated user interface.

```typescript
interface AgentuityAuthUser<T = unknown> {
	id: string;
	name?: string;
	email?: string;
	raw: T; // Provider-specific user object
}
```

#### `AgentuityAuth<TUser, TRaw>`

Generic authentication interface exposed on Hono context.

```typescript
interface AgentuityAuth<TUser = unknown, TRaw = unknown> {
	requireUser(): Promise<AgentuityAuthUser<TUser>>;
	getToken(): Promise<string | null>;
	raw: TRaw; // Provider-specific auth object (e.g., JWT payload)
}
```

## Templates

Get started quickly with the Clerk template:

```bash
bunx agentuity create my-app --template clerk
cd my-app
cp .env.example .env
# Add your Clerk keys to .env
bun dev
```

## Security Best Practices

1. **Never log tokens** - Avoid logging `authHeader` or JWT tokens
2. **Use HTTPS in production** - Always use TLS for production deployments
3. **Validate on every request** - Middleware validates tokens on each request
4. **Keep secrets secret** - Never commit `.env` files or expose `CLERK_SECRET_KEY`
5. **Use environment variables** - Store all keys in environment variables, not code

## Troubleshooting

### "Unauthorized" errors when signed in

**Check:**

1. Authorization header is present in request (browser DevTools → Network tab)
2. `CLERK_SECRET_KEY` is set in server environment
3. Token is being fetched (check console for "Failed to get Clerk token")

**Debug:**

```tsx
const { authHeader, authLoading, isAuthenticated } = useAuth();
console.log({ authHeader, authLoading, isAuthenticated });
```

### "Clerk secret key is required" error

Set `CLERK_SECRET_KEY` in your `.env` file:

```env
CLERK_SECRET_KEY=sk_test_...
```

### Token not being sent in requests

Ensure `AgentuityClerk` is a **child** of `AgentuityProvider`:

```tsx
// ✅ CORRECT
<AgentuityProvider>
  <AgentuityClerk useAuth={useAuth}>
    <App />
  </AgentuityClerk>
</AgentuityProvider>

// ❌ WRONG
<AgentuityClerk useAuth={useAuth}>
  <AgentuityProvider>
    <App />
  </AgentuityProvider>
</AgentuityClerk>
```

## Examples

See the [Clerk template](../../templates/clerk/) for a complete working example with:

- Sign-in/out UI
- Protected routes
- Public routes
- Conditional rendering based on auth state

## Contributing

This package follows the [Agentuity SDK contributing guidelines](../../AGENTS.md).

To add a new provider:

1. Create `src/<provider>/` directory
2. Implement `client.tsx` and `server.ts`
3. Export from `src/<provider>/index.ts`
4. Add export path to `package.json`
5. Add peer dependencies
6. Write tests in `test/<provider>-*.test.ts`

## License

MIT
