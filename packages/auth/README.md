# @agentuity/auth

First-class authentication for Agentuity projects, powered by [BetterAuth](https://better-auth.com).

## Features

- ✅ **Zero Configuration**: Works out of the box with just a database connection
- ✅ **Native Integration**: `ctx.auth` available on AgentContext and Hono routes
- ✅ **Organizations**: Multi-tenancy with roles and permissions
- ✅ **API Keys**: Programmatic access with fine-grained permissions
- ✅ **JWT Tokens**: Stateless auth for API calls
- ✅ **Drizzle Schema**: Type-safe database schema with migrations
- ✅ **React Hooks**: `useAuth()` for client-side auth state

## Installation

```bash
bun add @agentuity/auth
```

## Quick Start

### 1. Setup with CLI

```bash
agentuity project auth init
```

This will:

- Install required dependencies
- Generate `src/auth.ts` with default configuration
- Set up environment variables

### 2. Configure Database

```bash
# Create a database and get connection URL
agentuity cloud database create --region use

# Run auth migrations
agentuity project auth setup
```

### 3. Server Setup (Hono)

```typescript
// src/auth.ts
import {
	createAgentuityAuth,
	createSessionMiddleware,
	mountAgentuityAuthRoutes,
} from '@agentuity/auth';

export const auth = createAgentuityAuth({
	connectionString: process.env.DATABASE_URL,
	// Uses AGENTUITY_AUTH_SECRET env var by default
});

export const authMiddleware = createSessionMiddleware(auth);
export const optionalAuthMiddleware = createSessionMiddleware(auth, { optional: true });
```

```typescript
// src/api/index.ts
import { createRouter } from '@agentuity/runtime';
import { auth, authMiddleware } from '../auth';
import { mountAgentuityAuthRoutes } from '@agentuity/auth';

const api = createRouter();

// Mount auth routes (sign-in, sign-up, sign-out, session, etc.)
api.on(['GET', 'POST'], '/api/auth/*', mountAgentuityAuthRoutes(auth));

// Protect API routes
api.use('/api/*', authMiddleware);

api.get('/api/me', async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({ id: user.id, email: user.email });
});

export default api;
```

### 4. Client Setup (React)

```tsx
// src/web/auth-client.ts
import { createAgentuityAuthClient } from '@agentuity/auth/react';

export const authClient = createAgentuityAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
```

```tsx
// src/web/frontend.tsx
import { AgentuityProvider } from '@agentuity/react';
import { createAgentuityAuthClient, AgentuityAuthProvider } from '@agentuity/auth/react';
import { App } from './App';

const authClient = createAgentuityAuthClient();

<AgentuityProvider>
	<AgentuityAuthProvider authClient={authClient}>
		<App />
	</AgentuityAuthProvider>
</AgentuityProvider>;
```

### 5. Environment Variables

```env
# Database connection
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Auth secret (generate with: openssl rand -hex 32)
AGENTUITY_AUTH_SECRET=your-secret-here
```

## Usage

### Agent Access

Auth is native on AgentContext - no wrappers needed:

```typescript
import { createAgent } from '@agentuity/runtime';

export default createAgent('my-agent', {
	handler: async (ctx, input) => {
		// ctx.auth is available when using auth middleware
		if (!ctx.auth) {
			return { error: 'Please sign in' };
		}

		const user = await ctx.auth.getUser();
		const org = await ctx.auth.getOrg();

		// Check organization roles
		if (org && (await ctx.auth.hasOrgRole('admin'))) {
			// Admin-only logic
		}

		return { userId: user.id, orgId: org?.id };
	},
});
```

### Hono Routes

```typescript
import { createSessionMiddleware, createApiKeyMiddleware } from '@agentuity/auth';

// Session-based auth
api.get('/api/profile', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({ email: user.email });
});

// API key auth
api.use('/api/v1/*', createApiKeyMiddleware(auth));

api.get('/api/v1/data', async (c) => {
	// Check API key permissions
	if (!c.var.auth.hasPermission('data', 'read')) {
		return c.json({ error: 'Forbidden' }, 403);
	}
	return c.json({ data: '...' });
});
```

### React Components

```tsx
import { useAuth } from '@agentuity/react';
import { useAgentuityAuth } from '@agentuity/auth/react';

function Profile() {
	// Basic auth state from @agentuity/react
	const { isAuthenticated, authLoading } = useAuth();

	// Full auth context from @agentuity/auth
	const { user, isPending } = useAgentuityAuth();

	if (authLoading || isPending) return <div>Loading...</div>;
	if (!isAuthenticated) return <div>Please sign in</div>;

	return <div>Welcome, {user?.name}!</div>;
}
```

## Database Configuration

### Option A: Connection String (Simplest)

```typescript
import { createAgentuityAuth } from '@agentuity/auth';

export const auth = createAgentuityAuth({
	connectionString: process.env.DATABASE_URL,
});
```

### Option B: Bring Your Own Drizzle

Merge auth schema with your app schema:

```typescript
import { drizzle } from 'drizzle-orm/bun-sql';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as authSchema from '@agentuity/auth/schema';
import * as myAppSchema from './schema';

const schema = { ...authSchema, ...myAppSchema };
const db = drizzle(process.env.DATABASE_URL!, { schema });

export const auth = createAgentuityAuth({
	database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
});
```

### Option C: Other Adapters

Use any BetterAuth-compatible adapter:

```typescript
import { prismaAdapter } from 'better-auth/adapters/prisma';

export const auth = createAgentuityAuth({
	database: prismaAdapter(new PrismaClient()),
});
```

## API Reference

### Server

#### `createAgentuityAuth(options)`

Creates an auth instance with Agentuity defaults.

**Options:**

- `connectionString?: string` - PostgreSQL connection URL (simplest path)
- `database?: Adapter` - BetterAuth database adapter (for advanced use)
- `secret?: string` - Auth secret (defaults to `AGENTUITY_AUTH_SECRET` env var)
- `basePath?: string` - API path prefix (default: `/api/auth`)
- `emailAndPassword?: { enabled: boolean }` - Email auth (default: `{ enabled: true }`)
- `skipDefaultPlugins?: boolean` - Skip organization, JWT, bearer, API key plugins
- `apiKey?: ApiKeyPluginOptions | false` - API key configuration
- `plugins?: Plugin[]` - Additional BetterAuth plugins

#### `createSessionMiddleware(auth, options?)`

Hono middleware for session-based auth.

**Options:**

- `optional?: boolean` - If true, don't 401 on missing auth
- `otelSpans?: { email?: boolean, orgName?: boolean }` - Control PII in spans

#### `createApiKeyMiddleware(auth, options?)`

Hono middleware for API key auth.

**Options:**

- `optional?: boolean` - If true, don't 401 on missing API key
- `otelSpans?: { email?: boolean }` - Control PII in spans

#### `mountAgentuityAuthRoutes(auth, options?)`

Handler for BetterAuth routes with cookie merging.

**Options:**

- `allowList?: string[]` - Headers to forward from auth responses

### Client

#### `createAgentuityAuthClient(options?)`

Import from `@agentuity/auth/react`.

**Options:**

- `baseURL?: string` - API base URL (default: `window.location.origin`)
- `basePath?: string` - Auth path prefix (default: `/api/auth`)
- `skipDefaultPlugins?: boolean` - Skip organization and API key plugins
- `plugins?: Plugin[]` - Additional client plugins

**Returns:** BetterAuth client with `signIn`, `signUp`, `signOut`, `useSession`, etc.

#### `AgentuityAuthProvider`

React provider that bridges auth state to Agentuity context.

```tsx
import { AgentuityAuthProvider } from '@agentuity/auth/react';

<AgentuityAuthProvider authClient={authClient} refreshInterval={60000}>
	{children}
</AgentuityAuthProvider>;
```

#### `useAgentuityAuth()`

Hook for full auth context. Import from `@agentuity/auth/react`.

**Returns:**

- `user: AgentuityAuthUser | null`
- `isPending: boolean`
- `error: Error | null`
- `isAuthenticated: boolean`
- `authClient: AgentuityAuthClient`

### Schema

Import from `@agentuity/auth/schema`:

```typescript
import { user, session, organization, apikey, authSchema } from '@agentuity/auth/schema';
```

**Tables:**

- `user` - User accounts
- `session` - Active sessions
- `account` - OAuth/credential accounts
- `verification` - Email verification tokens
- `organization` - Organizations
- `member` - Organization memberships
- `invitation` - Pending invitations
- `jwks` - JWT signing keys
- `apikey` - API keys

**Combined:**

- `authSchema` - All tables and relations for easy spreading

### Types

```typescript
import type {
	AgentuityAuthContext,
	AgentuityOrgContext,
	AgentuityApiKeyContext,
	AgentuityAuthMethod,
	AgentuityAuthInterface,
} from '@agentuity/auth';
```

## CLI Commands

```bash
# Initialize auth in a project
agentuity project auth init

# Run database migrations
agentuity project auth setup

# Generate Drizzle schema
agentuity project auth generate

# Generate a secure secret
agentuity project auth secret
```

## Security Best Practices

1. **Use HTTPS in production** - Always use TLS for deployments
2. **Keep secrets secret** - Never commit `.env` files or expose `AGENTUITY_AUTH_SECRET`
3. **Rotate secrets periodically** - Rotate `AGENTUITY_AUTH_SECRET` on a regular schedule
4. **Control OTEL PII** - Use `otelSpans: { email: false }` to exclude sensitive data from telemetry
5. **Validate permissions** - Always check `hasPermission()` for API key routes

## Templates

Get started quickly:

```bash
bunx agentuity create my-app --template agentuity-auth
```

## Third-Party Providers

Agentuity Auth is the recommended solution. For Clerk, Auth0, or other providers, see:

- [Clerk Integration Guide](../../docs/recipes/clerk.md)
- [Auth0 Integration Guide](../../docs/recipes/auth0.md)

## License

MIT
