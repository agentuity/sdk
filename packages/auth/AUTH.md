# @agentuity/auth - Technical Requirements

## Overview

The `@agentuity/auth` package provides drop-in authentication helpers for popular identity providers (Clerk, WorkOS, Auth0, Better Auth, etc.). It bridges third-party auth providers with Agentuity's client and server SDKs, automatically handling token extraction, injection, and validation.

## Goals

1. **Zero Configuration**: Drop-in components that work out of the box
2. **Provider Agnostic**: Generic interfaces allow routes to be provider-independent
3. **Tree Shakeable**: Import only the providers you use (`@agentuity/auth/clerk`)
4. **Type Safe**: Full TypeScript support with proper type inference
5. **Automatic Token Injection**: Seamless integration with `useAPI` and `useWebsocket`
6. **Server Validation**: Easy middleware for token validation and user context

## Architecture

### Package Structure

```
packages/auth/
├── src/
│   ├── index.ts              # Core types and utilities (no provider code)
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── context.ts            # React context for auth state
│   ├── clerk/
│   │   ├── index.ts          # Re-exports client and server
│   │   ├── client.tsx        # AgentuityClerk component
│   │   └── server.ts         # createMiddleware for Hono
│   ├── workos/
│   │   ├── index.ts
│   │   ├── client.tsx
│   │   └── server.ts
│   ├── auth0/
│   │   ├── index.ts
│   │   ├── client.tsx
│   │   └── server.ts
│   └── better-auth/
│       ├── index.ts
│       ├── client.tsx
│       └── server.ts
├── package.json
└── tsconfig.json
```

### Export Map (package.json)

```json
{
	"name": "@agentuity/auth",
	"exports": {
		".": "./src/index.ts",
		"./clerk": "./src/clerk/index.ts",
		"./workos": "./src/workos/index.ts",
		"./auth0": "./src/auth0/index.ts",
		"./better-auth": "./src/better-auth/index.ts"
	},
	"peerDependencies": {
		"react": "^18.0.0 || ^19.0.0",
		"@clerk/clerk-react": "^5.0.0",
		"@clerk/backend": "^1.0.0",
		"@workos-inc/node": "^7.0.0",
		"auth0": "^4.0.0",
		"better-auth": "^1.0.0",
		"@agentuity/react": "workspace:*",
		"@agentuity/runtime": "workspace:*",
		"hono": "^4.0.0"
	},
	"peerDependenciesMeta": {
		"@clerk/clerk-react": { "optional": true },
		"@clerk/backend": { "optional": true },
		"@workos-inc/node": { "optional": true },
		"auth0": { "optional": true },
		"better-auth": { "optional": true }
	}
}
```

## Core Types & Interfaces

### Generic Auth User

```typescript
// src/types.ts
export interface AgentuityAuthUser<T = unknown> {
	/** Unique user identifier from the auth provider */
	id: string;

	/** User's full name */
	name?: string;

	/** Primary email address */
	email?: string;

	/** Raw provider-specific user object for advanced use cases */
	raw: T;
}

export interface AgentuityAuth<TUser = unknown, TRaw = unknown> {
	/** Get the authenticated user, throws if not authenticated */
	requireUser(): Promise<AgentuityAuthUser<TUser>>;

	/** Get the raw JWT token */
	getToken(): Promise<string | null>;

	/** Raw provider-specific auth object (e.g., JWT payload, session) */
	raw: TRaw;
}
```

### AgentuityContext Extension

Auth token will be stored in the existing `AgentuityContext` from `@agentuity/react`:

```typescript
// In @agentuity/react/src/context.ts (to be updated)
export interface AgentuityContextValue {
	// ... existing fields ...

	/** Authorization header value (set by auth providers) */
	authHeader?: string | null;

	/** Set the authorization header (internal use by auth providers) */
	setAuthHeader?(token: string | null): void;
}
```

## Client Implementation (React)

### Clerk Example

```typescript
// src/clerk/client.tsx
import React, { useEffect } from 'react';
import { UseAuth } from '@clerk/clerk-react';
import { useAgentuity } from '@agentuity/react';

interface AgentuityClerkProps {
  children: React.ReactNode;
  useAuth: UseAuth;
  /** Token refresh interval in ms (default: 60000 = 1 minute) */
  refreshInterval?: number;
}

export function AgentuityClerk({
  children,
  useAuth,
  refreshInterval = 60000
}: AgentuityClerkProps) {
  const { getToken, isLoaded } = useAuth();
  const { setAuthHeader } = useAgentuity();

  // Fetch and update token in AgentuityContext
  useEffect(() => {
    if (!isLoaded || !setAuthHeader) {
      return;
    }

    const fetchToken = async () => {
      try {
        const token = await getToken();
        setAuthHeader(token ? `Bearer ${token}` : null);
      } catch (error) {
        console.error('Failed to get Clerk token:', error);
        setAuthHeader(null);
      }
    };

    fetchToken();

    // Clerk handles token expiry internally, we refresh periodically
    const interval = setInterval(fetchToken, refreshInterval);
    return () => clearInterval(interval);
  }, [getToken, isLoaded, setAuthHeader, refreshInterval]);

  // Render children directly - auth header is now in AgentuityContext
  return <>{children}</>;
}
```

**Component Hierarchy**: `AgentuityClerk` must be a child of `AgentuityProvider` to access context.

### Integration with @agentuity/react

The existing `useAPI` and `useWebsocket` hooks automatically include auth headers from context:

```typescript
// In @agentuity/react/src/hooks/useAPI.ts (modifications)
export function useAPI(/* existing params */) {
	const { authHeader } = useAgentuity();

	// When making fetch request:
	const headers = {
		...defaultHeaders,
		...(authHeader && { Authorization: authHeader }),
	};

	// ... rest of implementation
}
```

## Server Implementation (Hono Middleware)

### Clerk Example

```typescript
// src/clerk/server.ts
import { MiddlewareHandler } from 'hono';
import { clerkClient, verifyToken } from '@clerk/backend';
import type { User, VerifyTokenOptions } from '@clerk/backend';
import { AgentuityAuth, AgentuityAuthUser } from '../types';

// Clerk JWT payload type
interface ClerkJWTPayload {
	sub: string;
	[key: string]: unknown;
}

export interface ClerkMiddlewareOptions {
	/** Clerk secret key (defaults to process.env.CLERK_SECRET_KEY) */
	secretKey?: string;

	/** Custom token extractor */
	getToken?: (authHeader: string) => string;

	/** Clerk publishable key for token verification */
	publishableKey?: string;
}

export function createMiddleware(options: ClerkMiddlewareOptions = {}): MiddlewareHandler {
	const secretKey = options.secretKey || process.env.CLERK_SECRET_KEY;
	const publishableKey = options.publishableKey || process.env.CLERK_PUBLISHABLE_KEY;

	if (!secretKey) {
		throw new Error('Clerk secret key is required');
	}

	return async (c, next) => {
		const authHeader = c.req.header('Authorization');

		if (!authHeader) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		try {
			// Extract token
			const token = options.getToken
				? options.getToken(authHeader)
				: authHeader.replace(/^Bearer\s+/i, '');

			// Verify token with Clerk (delegates validation to provider)
			const payload = (await verifyToken(token, {
				secretKey,
				publishableKey,
			})) as ClerkJWTPayload;

			// Create auth object with Clerk user and payload types
			const auth: AgentuityAuth<User, ClerkJWTPayload> = {
				async requireUser() {
					const user = await clerkClient.users.getUser(payload.sub);
					return mapClerkUserToAgentuityUser(user);
				},

				async getToken() {
					return token;
				},

				raw: payload,
			};

			c.set('auth', auth);
			await next();
		} catch (error) {
			console.error('Clerk auth error:', error);
			return c.json({ error: 'Unauthorized' }, 401);
		}
	};
}

function mapClerkUserToAgentuityUser(clerkUser: User): AgentuityAuthUser<User> {
	return {
		id: clerkUser.id,
		name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || undefined,
		email: clerkUser.emailAddresses[0]?.emailAddress,
		raw: clerkUser,
	};
}
```

### Hono Variable Types

Need to extend Hono's context types:

```typescript
// src/clerk/server.ts (add type augmentation)
import type { User } from '@clerk/backend';

interface ClerkJWTPayload {
	sub: string;
	[key: string]: unknown;
}

declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityAuth<User, ClerkJWTPayload>;
	}
}
```

## Usage Examples

### Client Side (React)

```typescript
// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { AgentuityClerk } from '@agentuity/auth/clerk';
import { AgentuityProvider } from '@agentuity/react';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={process.env.VITE_CLERK_PUBLISHABLE_KEY!}>
      <AgentuityProvider endpoint="https://api.example.com">
        <AgentuityClerk useAuth={useAuth}>
          <App />
        </AgentuityClerk>
      </AgentuityProvider>
    </ClerkProvider>
  </React.StrictMode>
);
```

**Note**: `AgentuityClerk` must be a child of `AgentuityProvider` to access context.

```typescript
// App.tsx - useAPI automatically includes auth header
import { useAPI } from '@agentuity/react';

function App() {
  const { data, error } = useAPI('/api/user/profile');

  // Token is automatically included in Authorization header
  return <div>{data?.name}</div>;
}
```

### Server Side (Hono)

```typescript
// server.ts
import { createRouter } from '@agentuity/runtime';
import { createMiddleware } from '@agentuity/auth/clerk';

const router = createRouter();

// Protected route with middleware
router.get('/api/user/profile', createMiddleware(), async (c) => {
	// Access Clerk JWT payload directly
	const payload = c.var.auth.raw; // Type: ClerkJWTPayload
	console.log('User ID from token:', payload.sub);

	const user = await c.var.auth.requireUser();
	return c.json({ name: user.name, email: user.email });
});

// Global middleware for all routes under /api
router.use('/api/*', createMiddleware());

router.post('/api/admin', async (c) => {
	const user = await c.var.auth.requireUser();
	// Returns 401 if not authenticated (middleware handles this)

	// Access provider-specific user fields via user.raw (fully typed)
	const clerkUser = user.raw; // Type: User from @clerk/backend
	console.log(clerkUser.publicMetadata);

	// Access JWT payload via auth.raw
	const jwtPayload = c.var.auth.raw; // Type: ClerkJWTPayload
	console.log('JWT claims:', jwtPayload);

	return c.json({ admin: true });
});
```

## Implementation Plan

### Phase 1: Core Infrastructure

1. Create package structure in `sdk/packages/auth`
2. Define core types in `src/types.ts`
3. Create auth context in `src/context.ts`
4. Set up package.json with peer dependencies and export map
5. Configure TypeScript with proper paths

### Phase 2: Clerk Integration (Reference Implementation)

1. Implement `AgentuityClerk` client component
2. Implement `createMiddleware` server function
3. Add Clerk-specific type mappings
4. Create example app demonstrating usage
5. Write unit tests for both client and server

### Phase 3: React Hook Integration

1. Update `@agentuity/react` to optionally use auth context
2. Modify `useAPI` to inject auth headers
3. Modify `useWebsocket` to inject auth tokens
4. Ensure backward compatibility (no auth provider = no auto-injection)

### Phase 4: Additional Providers

1. Implement WorkOS provider (client + server)
2. Implement Auth0 provider (client + server)
3. Implement Better Auth provider (client + server)

### Phase 5: Documentation & Testing

1. Create comprehensive README with examples
2. Add JSDoc comments to all public APIs
3. Write integration tests
4. Create migration guide for existing apps

## Technical Decisions

### 1. Context Integration

**Decision**: Auth providers must be children of `AgentuityProvider`  
**Rationale**: Enables composability and access to existing context for token storage

### 2. Token Storage

**Decision**: Store auth header in existing `AgentuityContext`  
**Rationale**: Reuse existing infrastructure, no separate context needed

### 3. User Interface

**Decision**: Minimal fields (id, name, email) with raw object for advanced usage  
**Rationale**: Keeps interface simple and provider-agnostic

### 4. Token Refresh

**Decision**: Provider handles expiry, we refresh periodically  
**Rationale**: Each provider has optimized refresh logic; configurable interval per provider

### 5. Server Validation

**Decision**: Delegate validation to provider SDK  
**Rationale**: Providers handle nuances of token verification best

### 6. Error Handling

**Decision**: `requireUser()` throws and returns 401  
**Rationale**: Clear contract - middleware always requires auth, no optional modes

### 7. Auto-Injection

**Decision**: Automatic when auth provider is mounted  
**Rationale**: Zero-config experience - if auth provider exists, headers are included

### 8. Type Safety

**Decision**: Generic interfaces with provider-specific types in `.raw`  
**Rationale**: Common interface for most use cases, escape hatch for provider-specific features

## Dependencies

### Required

- `@agentuity/react` (peer)
- `@agentuity/runtime` (peer)
- `hono` (peer)
- `react` (peer)

### Provider-Specific (optional peers)

- `@clerk/clerk-react` + `@clerk/backend`
- `@workos-inc/node`
- `auth0`
- `better-auth`

## Testing Strategy

1. **Unit Tests**: Mock provider SDKs, test token extraction/validation
2. **Integration Tests**: Real provider test accounts, full flow
3. **Type Tests**: Ensure TypeScript inference works correctly
4. **Example Apps**: One per provider demonstrating full integration

## Security Considerations

1. Never log tokens or sensitive user data
2. Validate tokens on every request (or use secure session)
3. Use HTTPS in production (enforce in middleware?)
4. Follow provider security best practices
5. Rate limit auth endpoints
6. Sanitize user metadata before exposing

## Success Metrics

1. Zero breaking changes to `@agentuity/react` for non-auth users
2. < 5 lines of code to add auth to existing app
3. Tree-shaking works (importing clerk doesn't bundle workos)
4. Type inference works (c.var.auth is fully typed)
5. All providers follow same interface pattern
