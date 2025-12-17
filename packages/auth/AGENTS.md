# Agent Guidelines for @agentuity/auth

## Package Overview

Authentication helpers for popular identity providers. Provides client-side React components and server-side Hono middleware for seamless auth integration with Agentuity applications.

## Commands

- **Build**: `bun run build` (generates TypeScript declarations)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `bun run clean` (removes dist/)
- **Test**: `bun test` (runs all tests)

## Architecture

- **Runtime**: Dual-target (browser for client, Bun/Node for server)
- **Build target**: TypeScript declarations only (source distribution)
- **Dependencies**: `@agentuity/react` (client), `@agentuity/runtime` (server)
- **Peer dependencies**: Provider SDKs (Clerk, WorkOS, etc.) are optional peers

## Structure

```
src/
├── index.ts              # Core exports (types only)
├── types.ts              # Shared TypeScript interfaces
├── clerk/
│   ├── index.ts          # Re-exports client and server
│   ├── client.tsx        # AgentuityClerk React component
│   └── server.ts         # createMiddleware for Hono
└── <provider>/           # Future providers (workos, auth0, etc.)
    ├── index.ts
    ├── client.tsx
    └── server.ts
test/
├── clerk-client.test.tsx # Client component tests
└── clerk-server.test.ts  # Server middleware tests
```

## Code Style

- **React components** - Follow React hooks conventions (client.tsx files)
- **TypeScript generics** - Heavy use of generics for type safety (`AgentuityAuthUser<T>`, `AgentuityAuth<TUser, TRaw>`)
- **Provider isolation** - Each provider in separate directory with own exports
- **Tree shaking** - Import paths like `@agentuity/auth/clerk` enable tree shaking

## Important Conventions

### Provider Structure

Each provider follows a consistent structure:

```
<provider>/
├── index.ts       # Re-exports client and server, main entry point
├── client.tsx     # React component for client-side auth
└── server.ts      # Hono middleware for server-side validation
```

### Type Safety

Providers use generic types for full type safety:

```typescript
// Generic user type with provider-specific raw object
export interface AgentuityAuthUser<T = unknown> {
	id: string;
	name?: string;
	email?: string;
	raw: T; // Fully typed provider-specific user object
}

// Generic auth interface with user and payload types
export interface AgentuityAuth<TUser = unknown, TRaw = unknown> {
	requireUser(): Promise<AgentuityAuthUser<TUser>>;
	getToken(): Promise<string | null>;
	raw: TRaw; // Fully typed provider-specific auth object (JWT payload, session, etc.)
}
```

### Hono Module Augmentation

Each provider must augment Hono's types:

```typescript
// src/clerk/server.ts
declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityAuth<User, ClerkJWTPayload>;
	}
}
```

This provides full type safety when accessing `c.var.auth` in routes.

### Environment Variables

Providers should support these patterns:

- **Public keys**: `AGENTUITY_PUBLIC_<PROVIDER>_<KEY>` (bundled into frontend)
- **Secret keys**: `<PROVIDER>_SECRET_KEY` or `<PROVIDER>_<KEY>` (server-only)
- **Fallback**: Also check standard provider env var names for compatibility

Example for Clerk:

```typescript
const publishableKey =
	options.publishableKey ||
	process.env.AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY ||
	process.env.CLERK_PUBLISHABLE_KEY;
```

### Error Handling

- **Missing env vars**: Log clear error messages with setup instructions
- **Invalid tokens**: Return 401 with generic error message (don't leak token details)
- **Provider errors**: Catch and wrap with generic 401 response

```typescript
if (!secretKey) {
	console.error(
		'[Clerk Auth] CLERK_SECRET_KEY is not set. Add it to your .env file or pass secretKey option to createMiddleware()'
	);
	throw new Error('Clerk secret key is required (set CLERK_SECRET_KEY or pass secretKey option)');
}
```

## Testing

### Test Organization

Follow SDK testing standards:

- All tests in `test/` folder
- Client tests: `test/<provider>-client.test.tsx`
- Server tests: `test/<provider>-server.test.ts`

### Testing Strategy

1. **Client tests**: Verify component exports and prop interfaces (DOM testing is complex, keep simple)
2. **Server tests**: Test middleware behavior (401 responses, env var validation)
3. **Integration tests**: Use templates for end-to-end testing

### Example Test Pattern

```typescript
import { describe, test, expect } from 'bun:test';
import { createMiddleware } from '../src/clerk/server';

describe('Clerk server middleware', () => {
	test('returns 401 when Authorization header is missing', async () => {
		const app = new Hono();
		app.use('/protected', createMiddleware());
		app.get('/protected', (c) => c.json({ success: true }));

		const res = await app.request('/protected', { method: 'GET' });
		expect(res.status).toBe(401);
	});
});
```

## Adding a New Provider

### 1. Create Provider Directory

```bash
mkdir -p src/workos
```

### 2. Implement Client Component

```typescript
// src/workos/client.tsx
import React, { useEffect } from 'react';
import { useAuth } from '@agentuity/react';
import type { useAuth as WorkOSUseAuth } from '@workos/react';

export interface AgentuityWorkOSProps {
	children: React.ReactNode;
	useAuth: typeof WorkOSUseAuth;
}

export function AgentuityWorkOS({ children, useAuth: workosUseAuth }: AgentuityWorkOSProps) {
	const { getToken, isLoaded } = workosUseAuth();
	const { setAuthHeader, setAuthLoading } = useAuth();

	useEffect(() => {
		if (!isLoaded || !setAuthHeader || !setAuthLoading) {
			setAuthLoading?.(true);
			return;
		}

		const fetchToken = async () => {
			try {
				setAuthLoading(true);
				const token = await getToken();
				setAuthHeader(token ? `Bearer ${token}` : null);
			} catch (error) {
				console.error('Failed to get WorkOS token:', error);
				setAuthHeader(null);
			} finally {
				setAuthLoading(false);
			}
		};

		fetchToken();
	}, [getToken, isLoaded, setAuthHeader, setAuthLoading]);

	return <>{children}</>;
}
```

### 3. Implement Server Middleware

```typescript
// src/workos/server.ts
import type { MiddlewareHandler } from 'hono';
import { WorkOS } from '@workos-inc/node';
import type { AgentuityAuth, AgentuityAuthUser } from '../types';

export interface WorkOSMiddlewareOptions {
	apiKey?: string;
	clientId?: string;
}

export function createMiddleware(options: WorkOSMiddlewareOptions = {}): MiddlewareHandler {
	const apiKey = options.apiKey || process.env.WORKOS_API_KEY;
	const clientId = options.clientId || process.env.WORKOS_CLIENT_ID;

	if (!apiKey) {
		console.error('[WorkOS Auth] WORKOS_API_KEY is not set');
		throw new Error('WorkOS API key is required');
	}

	const workos = new WorkOS(apiKey);

	return async (c, next) => {
		const authHeader = c.req.header('Authorization');

		if (!authHeader) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		try {
			const token = authHeader.replace(/^Bearer\s+/i, '');

			// Verify token with WorkOS
			const { user } = await workos.userManagement.authenticateWithSessionCookie(token);

			const auth: AgentuityAuth<typeof user, unknown> = {
				async requireUser() {
					return {
						id: user.id,
						email: user.email,
						name: `${user.firstName} ${user.lastName}`.trim(),
						raw: user,
					};
				},
				async getToken() {
					return token;
				},
				raw: {}, // WorkOS session data
			};

			c.set('auth', auth);
			await next();
		} catch (error) {
			console.error('WorkOS auth error:', error);
			return c.json({ error: 'Unauthorized' }, 401);
		}
	};
}

declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityAuth<any, unknown>;
	}
}
```

### 4. Create Index File

```typescript
// src/workos/index.ts
export { AgentuityWorkOS } from './client';
export type { AgentuityWorkOSProps } from './client';
export { createMiddleware } from './server';
export type { WorkOSMiddlewareOptions } from './server';
```

### 5. Update Package Exports

```json
// package.json
{
	"exports": {
		".": "./src/index.ts",
		"./clerk": "./src/clerk/index.ts",
		"./workos": "./src/workos/index.ts"
	},
	"peerDependencies": {
		"@workos-inc/node": "^7.0.0"
	},
	"peerDependenciesMeta": {
		"@workos-inc/node": { "optional": true }
	}
}
```

### 6. Write Tests

```typescript
// test/workos-server.test.ts
import { describe, test, expect } from 'bun:test';
import { createMiddleware } from '../src/workos/server';

describe('WorkOS server middleware', () => {
	test('throws error when WORKOS_API_KEY is missing', () => {
		delete process.env.WORKOS_API_KEY;
		expect(() => createMiddleware()).toThrow('WorkOS API key is required');
	});
});
```

### 7. Create Template (Optional)

Create a template in `templates/workos/` following the same pattern as `templates/clerk/`.

## Integration with @agentuity/react

The auth package integrates with `@agentuity/react` through context:

### Context Updates

Auth providers set these context values:

- `authHeader` - The full Authorization header value (e.g., `"Bearer token123"`)
- `authLoading` - Whether auth is still initializing

### Hook Integration

`useAPI` and `useWebsocket` automatically use these values:

- **useAPI**: Adds `Authorization` header to all HTTP requests
- **useWebsocket**: Adds `token` query parameter (WebSocket can't send custom headers)

Both hooks include `context.authHeader` in their dependency arrays, so they react to auth changes.

## Common Patterns

### Conditional Rendering Based on Auth

```tsx
import { useAuth } from '@agentuity/react';

function ProtectedComponent() {
	const { isAuthenticated, authLoading } = useAuth();

	if (authLoading) {
		return <div>Loading...</div>;
	}

	if (!isAuthenticated) {
		return <SignInButton />;
	}

	return <div>Protected content</div>;
}
```

### Optional Auth Routes

Most routes should be protected, but for optional auth:

```typescript
// Don't use middleware, check auth manually
router.get('/public-or-personalized', async (c) => {
	// Check if auth was set by global middleware
	const authHeader = c.req.header('Authorization');

	if (authHeader) {
		try {
			const user = await c.var.auth?.requireUser();
			return c.json({ personalized: true, userId: user?.id });
		} catch {
			// Auth failed, treat as public
		}
	}

	return c.json({ personalized: false });
});
```

### Access Token Directly

```typescript
router.get('/token-info', createMiddleware(), async (c) => {
	const token = await c.var.auth.getToken();
	// Use token to call external APIs
	const response = await fetch('https://external-api.com/data', {
		headers: { Authorization: `Bearer ${token}` },
	});
	return c.json(await response.json());
});
```

## Technical Details

### Why Two Generic Parameters?

`AgentuityAuth<TUser, TRaw>` has two generics to provide type safety for:

1. **TUser**: The provider's user object type (e.g., Clerk's `User`)
2. **TRaw**: The provider's auth/session object type (e.g., JWT payload, session data)

This allows:

```typescript
const user = await c.var.auth.requireUser();
user.raw; // Fully typed as Clerk User

const payload = c.var.auth.raw;
payload.sub; // Fully typed as ClerkJWTPayload
```

### Token Refresh Strategy

Each provider handles token refresh differently:

- **Clerk**: Provider handles expiry internally, we poll periodically (default: 60s)
- **WorkOS**: Session cookies with expiry, refresh on demand
- **Auth0**: Refresh tokens, exchange on expiry

The `refreshInterval` prop allows customization per provider.

### WebSocket Authentication

WebSockets don't support custom headers, so we pass tokens via query parameter:

```typescript
// In @agentuity/react/src/websocket.ts
if (context.authHeader) {
	const token = context.authHeader.replace(/^Bearer\s+/i, '');
	queryParams.set('token', token);
}
```

Server middleware should extract from query param for WebSocket routes.

## Maintenance

### When Adding Provider Support

1. Research provider's auth flow (JWT, session, OAuth, etc.)
2. Identify token extraction method (header, cookie, etc.)
3. Implement client component (token fetching)
4. Implement server middleware (token validation)
5. Add type augmentation for Hono
6. Write basic tests
7. Create template if commonly used
8. Update README with usage example

### When Updating Dependencies

Check compatibility:

- Provider SDK major version changes
- Hono type system changes
- React version compatibility

### Common Issues

**"Module not found" errors**: Ensure export paths are correct in package.json

**Type errors in routes**: Verify Hono module augmentation is present

**401 errors**: Check:

1. Environment variables set correctly
2. Token format matches provider expectations
3. Provider SDK configured correctly

## Code Conventions

### Naming

- Client components: `Agentuity<Provider>` (e.g., `AgentuityClerk`)
- Server functions: `createMiddleware()` (consistent across providers)
- Props interfaces: `Agentuity<Provider>Props`
- Options interfaces: `<Provider>MiddlewareOptions`

### Error Messages

Include setup instructions in error messages:

```typescript
if (!secretKey) {
	console.error(
		'[Provider Auth] PROVIDER_SECRET_KEY is not set. Add it to your .env file or pass secretKey option'
	);
	throw new Error('Provider secret key is required');
}
```

### Exports

Each provider exports from its index.ts:

```typescript
// src/clerk/index.ts
export { AgentuityClerk } from './client';
export type { AgentuityClerkProps } from './client';
export { createMiddleware } from './server';
export type { ClerkMiddlewareOptions, ClerkJWTPayload } from './server';
```

Main package exports only core types:

```typescript
// src/index.ts
export type { AgentuityAuthUser, AgentuityAuth } from './types';
```

## Publishing Checklist

1. Run `bun run build` to generate type declarations
2. Run `bun run typecheck` to verify no type errors
3. Run `bun test` to ensure tests pass
4. Verify peer dependencies are correctly marked as optional
5. Must publish **after** `@agentuity/react` and `@agentuity/runtime`
6. Update templates if provider support changes

## Security Considerations

### Never Log Secrets

```typescript
// ❌ WRONG
console.log('Token:', token);
console.log('Auth header:', authHeader);

// ✅ CORRECT
console.log('Auth header present:', !!authHeader);
```

### Validate on Every Request

Don't cache validation results - providers may revoke tokens:

```typescript
// Middleware validates on every request
return async (c, next) => {
	const token = extractToken(c);
	const payload = await verifyToken(token); // Fresh validation
	c.set('auth', createAuthObject(payload));
	await next();
};
```

### Use Provider SDKs

Always use the official provider SDK for validation:

```typescript
// ✅ CORRECT
import { verifyToken } from '@clerk/backend';
await verifyToken(token, { secretKey });

// ❌ WRONG (don't manually verify JWTs)
const decoded = jwt.verify(token, secretKey);
```

## FAQ

**Q: Why not use provider middleware directly?**  
A: Provider middleware is often framework-specific (Express, Next.js). We provide a thin Hono wrapper with a generic interface.

**Q: Can I use multiple providers?**  
A: Not simultaneously. Choose one provider per app.

**Q: How do I handle refresh tokens?**  
A: Most providers handle this internally. We refresh periodically to get the latest token.

**Q: What about server-side session cookies?**  
A: Some providers (WorkOS, Auth0) use cookies. Extract from `c.req.header('Cookie')` instead of `Authorization`.

**Q: How do I test without real provider accounts?**  
A: Mock the provider SDK functions. See test files for examples.

## Related Documentation

- [SDK AGENTS.md](../../AGENTS.md) - Monorepo development guidelines
- [README.md](./README.md) - User-facing documentation
- [Clerk Template](../../templates/clerk/) - Complete working example
