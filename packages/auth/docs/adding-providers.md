# Adding New Auth Providers

Guide for implementing new authentication providers in `@agentuity/auth`.

## Provider Structure

Each provider follows a consistent structure:

```
src/<provider>/
├── index.ts       # Re-exports client and server
├── client.tsx     # React component for client-side auth
└── server.ts      # Hono middleware for server-side validation
```

## Step 1: Create Provider Directory

```bash
mkdir -p src/workos
```

## Step 2: Implement Client Component

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

## Step 3: Implement Server Middleware

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
				raw: {},
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

## Step 4: Create Index File

```typescript
// src/workos/index.ts
export { AgentuityWorkOS } from './client';
export type { AgentuityWorkOSProps } from './client';
export { createMiddleware } from './server';
export type { WorkOSMiddlewareOptions } from './server';
```

## Step 5: Update Package Exports

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

## Step 6: Write Tests

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

## Type Safety Requirements

### Generic Types

Providers must use generic types for full type safety:

```typescript
export interface AgentuityAuthUser<T = unknown> {
	id: string;
	name?: string;
	email?: string;
	raw: T; // Provider-specific user object
}

export interface AgentuityAuth<TUser = unknown, TRaw = unknown> {
	requireUser(): Promise<AgentuityAuthUser<TUser>>;
	getToken(): Promise<string | null>;
	raw: TRaw; // Provider-specific auth object
}
```

### Hono Module Augmentation

Each provider must augment Hono's types:

```typescript
declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityAuth<User, ClerkJWTPayload>;
	}
}
```

## Environment Variables

Support these patterns:

- **Public keys**: `AGENTUITY_PUBLIC_<PROVIDER>_<KEY>`
- **Secret keys**: `<PROVIDER>_SECRET_KEY`
- **Fallback**: Standard provider env var names

## Common Patterns

### Conditional Rendering

```tsx
function ProtectedComponent() {
	const { isAuthenticated, authLoading } = useAuth();

	if (authLoading) return <div>Loading...</div>;
	if (!isAuthenticated) return <SignInButton />;
	return <div>Protected content</div>;
}
```

### Optional Auth Routes

```typescript
router.get('/public-or-personalized', async (c) => {
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

## Security Rules

- **Never log secrets**: `console.log('Auth present:', !!authHeader)` not the actual token
- **Validate on every request**: Don't cache validation results
- **Use provider SDKs**: Never manually verify JWTs

## Checklist

1. Research provider's auth flow (JWT, session, OAuth)
2. Implement client component (token fetching)
3. Implement server middleware (token validation)
4. Add Hono type augmentation
5. Write tests
6. Update package.json exports
7. Create template if commonly used
