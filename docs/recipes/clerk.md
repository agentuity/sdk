# Using Clerk with Agentuity

This guide shows how to integrate [Clerk](https://clerk.com) as a third-party auth provider with Agentuity projects.

> **Note:** Agentuity Auth (`@agentuity/auth`) is the recommended first-class authentication solution. Use this guide only if you specifically need Clerk.

## Overview

While Agentuity Auth provides built-in authentication, you can use Clerk for authentication by:

1. Using Clerk's React SDK for the frontend
2. Creating custom Hono middleware for the server
3. Manually bridging auth state to Agentuity's context

## Installation

```bash
bun add @clerk/clerk-react @clerk/backend
```

## Client Setup

### 1. Clerk Provider

```tsx
// src/web/frontend.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { AgentuityProvider } from '@agentuity/react';
import { App } from './App';
import { ClerkAuthBridge } from './ClerkAuthBridge';

const CLERK_PUBLISHABLE_KEY = import.meta.env.AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <AgentuityProvider>
        <ClerkAuthBridge>
          <App />
        </ClerkAuthBridge>
      </AgentuityProvider>
    </ClerkProvider>
  </React.StrictMode>
);
```

### 2. Auth Bridge Component

Bridge Clerk's auth state to Agentuity's context:

```tsx
// src/web/ClerkAuthBridge.tsx
import { useEffect, type ReactNode } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useAuth } from '@agentuity/react';

interface ClerkAuthBridgeProps {
  children: ReactNode;
  refreshInterval?: number;
}

export function ClerkAuthBridge({ 
  children, 
  refreshInterval = 60000 
}: ClerkAuthBridgeProps) {
  const { getToken, isLoaded, isSignedIn } = useClerkAuth();
  const { setAuthHeader, setAuthLoading } = useAuth();

  useEffect(() => {
    if (!setAuthHeader || !setAuthLoading) return;

    const fetchToken = async () => {
      setAuthLoading(true);
      try {
        if (isLoaded && isSignedIn) {
          const token = await getToken();
          setAuthHeader(token ? `Bearer ${token}` : null);
        } else {
          setAuthHeader(null);
        }
      } catch (error) {
        console.error('Failed to get Clerk token:', error);
        setAuthHeader(null);
      } finally {
        setAuthLoading(false);
      }
    };

    fetchToken();

    const interval = setInterval(fetchToken, refreshInterval);
    return () => clearInterval(interval);
  }, [getToken, isLoaded, isSignedIn, refreshInterval, setAuthHeader, setAuthLoading]);

  return <>{children}</>;
}
```

### 3. Using Auth State

```tsx
import { useAuth } from '@agentuity/react';
import { useUser, SignInButton, UserButton } from '@clerk/clerk-react';

function Header() {
  const { isAuthenticated, authLoading } = useAuth();
  const { user } = useUser();

  if (authLoading) return <div>Loading...</div>;

  return (
    <header>
      {isAuthenticated ? (
        <>
          <span>Welcome, {user?.firstName}!</span>
          <UserButton />
        </>
      ) : (
        <SignInButton />
      )}
    </header>
  );
}
```

## Server Setup

### 1. Clerk Middleware

Create custom Hono middleware for Clerk token verification:

```typescript
// src/middleware/clerk.ts
import type { MiddlewareHandler, Context } from 'hono';
import { createClerkClient, type User } from '@clerk/backend';

interface ClerkAuthContext {
  user: User;
  userId: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    clerkAuth: ClerkAuthContext | null;
  }
}

interface ClerkMiddlewareOptions {
  secretKey?: string;
  optional?: boolean;
}

export function createClerkMiddleware(
  options: ClerkMiddlewareOptions = {}
): MiddlewareHandler {
  const { 
    secretKey = process.env.CLERK_SECRET_KEY,
    optional = false 
  } = options;

  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is required');
  }

  const clerk = createClerkClient({ secretKey });

  return async (c: Context, next) => {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      if (optional) {
        c.set('clerkAuth', null);
        await next();
        return;
      }
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7);

    try {
      const payload = await clerk.verifyToken(token);
      const user = await clerk.users.getUser(payload.sub);

      c.set('clerkAuth', {
        user,
        userId: user.id,
      });

      await next();
    } catch (error) {
      console.error('Clerk verification failed:', error);
      
      if (optional) {
        c.set('clerkAuth', null);
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
import { createClerkMiddleware } from '../middleware/clerk';

const api = createRouter();

// Protect routes
api.use('/api/*', createClerkMiddleware());

api.get('/api/profile', async (c) => {
  const auth = c.var.clerkAuth!;
  return c.json({
    id: auth.userId,
    email: auth.user.emailAddresses[0]?.emailAddress,
    name: `${auth.user.firstName} ${auth.user.lastName}`,
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
    // Access Clerk user ID from headers if passed
    const userId = ctx.headers.get('x-clerk-user-id');
    
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
AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Server-side (kept secret)
CLERK_SECRET_KEY=sk_test_...
```

Get your keys from the [Clerk Dashboard](https://dashboard.clerk.com).

## Differences from Agentuity Auth

| Feature | Agentuity Auth | Clerk |
|---------|---------------|-------|
| `ctx.auth` on AgentContext | ✅ Native | ❌ Manual |
| Database-backed sessions | ✅ Built-in | ❌ External |
| Organizations | ✅ Built-in | ✅ With Clerk Orgs |
| API Keys | ✅ Built-in | ❌ Not available |
| Self-hosted | ✅ Yes | ❌ Cloud only |
| Pricing | ✅ Free | 💰 Per MAU |

## Migration to Agentuity Auth

If you want to migrate from Clerk to Agentuity Auth:

1. Set up Agentuity Auth per the [main docs](../../packages/auth/README.md)
2. Create migration routes for existing users
3. Update frontend to use `AgentuityAuthProvider`
4. Remove Clerk dependencies

```bash
# Install Agentuity Auth
bun add @agentuity/auth

# Remove Clerk
bun remove @clerk/clerk-react @clerk/backend
```

## Troubleshooting

### Token not being sent

Ensure `ClerkAuthBridge` is inside both `ClerkProvider` and `AgentuityProvider`:

```tsx
<ClerkProvider>
  <AgentuityProvider>
    <ClerkAuthBridge>
      <App />
    </ClerkAuthBridge>
  </AgentuityProvider>
</ClerkProvider>
```

### "Unauthorized" on protected routes

1. Check that `CLERK_SECRET_KEY` is set on the server
2. Verify the token is being sent (check Network tab)
3. Ensure the middleware is applied before your routes

### Token refresh issues

Clerk tokens expire every 60 seconds by default. The `ClerkAuthBridge` refreshes tokens on an interval. Adjust `refreshInterval` if needed.
