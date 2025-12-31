# Using Auth0 with Agentuity

This guide shows how to integrate [Auth0](https://auth0.com) as a third-party auth provider with Agentuity projects.

> **Note:** Agentuity Auth (`@agentuity/auth`) is the recommended first-class authentication solution. Use this guide only if you specifically need Auth0.

## Overview

While Agentuity Auth provides built-in authentication, you can use Auth0 for authentication by:

1. Using Auth0's React SDK for the frontend
2. Creating custom Hono middleware for JWT verification
3. Manually bridging auth state to Agentuity's context

## Installation

```bash
bun add @auth0/auth0-react jose
```

## Client Setup

### 1. Auth0 Provider

```tsx
// src/web/frontend.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { AgentuityProvider } from '@agentuity/react';
import { App } from './App';
import { Auth0Bridge } from './Auth0Bridge';

const AUTH0_DOMAIN = import.meta.env.AGENTUITY_PUBLIC_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = import.meta.env.AGENTUITY_PUBLIC_AUTH0_CLIENT_ID;
const AUTH0_AUDIENCE = import.meta.env.AGENTUITY_PUBLIC_AUTH0_AUDIENCE;

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<Auth0Provider
			domain={AUTH0_DOMAIN}
			clientId={AUTH0_CLIENT_ID}
			authorizationParams={{
				redirect_uri: window.location.origin,
				audience: AUTH0_AUDIENCE,
			}}
		>
			<AgentuityProvider>
				<Auth0Bridge>
					<App />
				</Auth0Bridge>
			</AgentuityProvider>
		</Auth0Provider>
	</React.StrictMode>
);
```

### 2. Auth Bridge Component

Bridge Auth0's auth state to Agentuity's context:

```tsx
// src/web/Auth0Bridge.tsx
import { useEffect, type ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useAuth } from '@agentuity/react';

interface Auth0BridgeProps {
	children: ReactNode;
	refreshInterval?: number;
}

export function Auth0Bridge({ children, refreshInterval = 60000 }: Auth0BridgeProps) {
	const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();
	const { setAuthHeader, setAuthLoading } = useAuth();

	useEffect(() => {
		if (!setAuthHeader || !setAuthLoading) return;

		const fetchToken = async () => {
			setAuthLoading(true);
			try {
				if (!isLoading && isAuthenticated) {
					const token = await getAccessTokenSilently();
					setAuthHeader(token ? `Bearer ${token}` : null);
				} else {
					setAuthHeader(null);
				}
			} catch (error) {
				console.error('Failed to get Auth0 token:', error);
				setAuthHeader(null);
			} finally {
				setAuthLoading(false);
			}
		};

		fetchToken();

		const interval = setInterval(fetchToken, refreshInterval);
		return () => clearInterval(interval);
	}, [
		getAccessTokenSilently,
		isAuthenticated,
		isLoading,
		refreshInterval,
		setAuthHeader,
		setAuthLoading,
	]);

	return <>{children}</>;
}
```

### 3. Using Auth State

```tsx
import { useAuth } from '@agentuity/react';
import { useAuth0 } from '@auth0/auth0-react';

function Header() {
	const { isAuthenticated, authLoading } = useAuth();
	const { user, loginWithRedirect, logout } = useAuth0();

	if (authLoading) return <div>Loading...</div>;

	return (
		<header>
			{isAuthenticated ? (
				<>
					<span>Welcome, {user?.name}!</span>
					<img src={user?.picture} alt={user?.name} />
					<button
						onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
					>
						Sign Out
					</button>
				</>
			) : (
				<button onClick={() => loginWithRedirect()}>Sign In</button>
			)}
		</header>
	);
}
```

## Server Setup

### 1. Auth0 Middleware

Create custom Hono middleware for Auth0 JWT verification:

```typescript
// src/middleware/auth0.ts
import type { MiddlewareHandler, Context } from 'hono';
import * as jose from 'jose';

interface Auth0User {
	sub: string;
	email?: string;
	name?: string;
	picture?: string;
	[key: string]: unknown;
}

interface Auth0AuthContext {
	user: Auth0User;
	userId: string;
}

declare module 'hono' {
	interface ContextVariableMap {
		auth0: Auth0AuthContext | null;
	}
}

interface Auth0MiddlewareOptions {
	domain?: string;
	audience?: string;
	optional?: boolean;
}

let jwks: jose.JWTVerifyGetKey | null = null;

async function getJwks(domain: string): Promise<jose.JWTVerifyGetKey> {
	if (!jwks) {
		jwks = jose.createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
	}
	return jwks;
}

export function createAuth0Middleware(options: Auth0MiddlewareOptions = {}): MiddlewareHandler {
	const {
		domain = process.env.AUTH0_DOMAIN,
		audience = process.env.AUTH0_AUDIENCE,
		optional = false,
	} = options;

	if (!domain) {
		throw new Error('AUTH0_DOMAIN is required');
	}

	return async (c: Context, next) => {
		const authHeader = c.req.header('Authorization');

		if (!authHeader?.startsWith('Bearer ')) {
			if (optional) {
				c.set('auth0', null);
				await next();
				return;
			}
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const token = authHeader.slice(7);

		try {
			const verifier = await getJwks(domain);

			const { payload } = await jose.jwtVerify(token, verifier, {
				issuer: `https://${domain}/`,
				audience,
			});

			const user: Auth0User = {
				sub: payload.sub!,
				email: payload.email as string | undefined,
				name: payload.name as string | undefined,
				picture: payload.picture as string | undefined,
				...payload,
			};

			c.set('auth0', {
				user,
				userId: payload.sub!,
			});

			await next();
		} catch (error) {
			console.error('Auth0 verification failed:', error);

			if (optional) {
				c.set('auth0', null);
				await next();
				return;
			}
			return c.json({ error: 'Unauthorized' }, 401);
		}
	};
}
```

### 2. Using in Routes

```typescript
// src/api/index.ts
import { createRouter } from '@agentuity/runtime';
import { createAuth0Middleware } from '../middleware/auth0';

const api = createRouter();

// Protect routes
api.use('/api/*', createAuth0Middleware());

api.get('/api/profile', async (c) => {
	const auth = c.var.auth0!;
	return c.json({
		id: auth.userId,
		email: auth.user.email,
		name: auth.user.name,
		picture: auth.user.picture,
	});
});

export default api;
```

### 3. Agent Access

For agents, pass auth info through context or headers:

```typescript
// src/agent/my-agent/agent.ts
import { createAgent } from '@agentuity/runtime';

export default createAgent('my-agent', {
	handler: async (ctx, input) => {
		// Access Auth0 user ID from headers if passed
		const userId = ctx.headers.get('x-auth0-user-id');

		if (!userId) {
			return { error: 'Unauthorized' };
		}

		return { userId, message: 'Hello from agent!' };
	},
});
```

## Environment Variables

```env
# Client-side (bundled into frontend)
AGENTUITY_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
AGENTUITY_PUBLIC_AUTH0_CLIENT_ID=your-client-id
AGENTUITY_PUBLIC_AUTH0_AUDIENCE=https://your-api-identifier

# Server-side
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://your-api-identifier
```

### Auth0 Dashboard Setup

1. Create a **Single Page Application** for your frontend
2. Create an **API** for your backend
3. Configure allowed callback URLs, logout URLs, and web origins
4. Copy the domain, client ID, and audience values

## Differences from Agentuity Auth

| Feature                    | Agentuity Auth | Auth0              |
| -------------------------- | -------------- | ------------------ |
| `ctx.auth` on AgentContext | ✅ Native      | ❌ Manual          |
| Database-backed sessions   | ✅ Built-in    | ❌ External        |
| Organizations              | ✅ Built-in    | ✅ With Auth0 Orgs |
| API Keys                   | ✅ Built-in    | ❌ Not available   |
| Self-hosted                | ✅ Yes         | ❌ Cloud only      |
| Pricing                    | ✅ Free        | 💰 Per MAU         |
| Social logins              | ✅ Via plugins | ✅ Built-in        |

## Migration to Agentuity Auth

If you want to migrate from Auth0 to Agentuity Auth:

1. Set up Agentuity Auth per the [main docs](../../packages/auth/README.md)
2. Create migration routes for existing users
3. Update frontend to use `AgentuityAuthProvider`
4. Remove Auth0 dependencies

```bash
# Install Agentuity Auth
bun add @agentuity/auth

# Remove Auth0
bun remove @auth0/auth0-react jose
```

## Troubleshooting

### Token not being sent

Ensure `Auth0Bridge` is inside both `Auth0Provider` and `AgentuityProvider`:

```tsx
<Auth0Provider>
	<AgentuityProvider>
		<Auth0Bridge>
			<App />
		</Auth0Bridge>
	</AgentuityProvider>
</Auth0Provider>
```

### "Unauthorized" on protected routes

1. Check that `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set on the server
2. Verify the token is being sent (check Network tab)
3. Ensure the middleware is applied before your routes
4. Check that the audience matches between client and server

### "consent_required" error

Make sure your Auth0 API has the "Allow Skipping User Consent" option enabled for first-party applications.

### Token refresh issues

Auth0 tokens expire based on your API settings. The `Auth0Bridge` refreshes tokens on an interval. You can also use `getAccessTokenSilently({ cacheMode: 'off' })` for fresh tokens.
