# Agentuity Auth Test App

A canonical example demonstrating **Agentuity Auth** (BetterAuth) integration with the Agentuity runtime.

## What This Demonstrates

- ✅ **BetterAuth Integration** - Full auth setup with `@agentuity/auth`
- ✅ **Session & API Key Auth** - Both authentication methods via unified middleware
- ✅ **Protected Routes** - Using `createSessionMiddleware()`
- ✅ **Protected Agents** - Using propagated auth context
- ✅ **React Client** - `AuthProvider` with `useSession()`
- ✅ **Optional Auth** - Routes that work for both authenticated and anonymous users

## Project Structure

```
ag-auth-test-app/
├── src/
│   ├── auth.ts              # Auth configuration (single source of truth)
│   ├── agent/
│   │   └── hello/agent.ts   # Example agent
│   ├── api/
│   │   └── index.ts         # API routes with auth middleware
│   └── web/
│       ├── App.tsx          # Main React app
│       ├── AuthDemo.tsx     # Auth UI demo component
│       ├── auth-client.ts   # BetterAuth React client
│       └── frontend.tsx     # Entry point
├── app.ts                   # Application entry point
└── agentuity.config.ts      # Agentuity configuration
```

## Key Files

### `src/auth.ts` - Server Configuration

The single source of truth for authentication:

```typescript
import { createAuth } from '@agentuity/auth';

export const auth = createAuth({
	connectionString: process.env.DATABASE_URL,
	trustedOrigins: [
		process.env.BETTER_AUTH_URL,
		'http://localhost:3500',
		'http://127.0.0.1:3500',
	],
});
```

### `src/api/index.ts` - Route Protection

```typescript
import { mountAuthRoutes, createSessionMiddleware } from '@agentuity/auth';

const authMiddleware = createSessionMiddleware(auth);
const optionalAuthMiddleware = createSessionMiddleware(auth, { optional: true });

// Better Auth routes (signup, signin, signout, session, etc.)
api.on(['GET', 'POST'], '/auth/*', mountAuthRoutes(auth));

// Protected route - requires auth
api.get('/me', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({ id: user.id, name: user.name });
});

// Optional auth - works for authenticated and anonymous
api.get('/greeting', optionalAuthMiddleware, async (c) => {
	try {
		const user = await c.var.auth.getUser();
		return c.json({ message: `Hello, ${user.name}!` });
	} catch {
		return c.json({ message: 'Hello, anonymous!' });
	}
});

// Role-based protection
api.get('/admin', createSessionMiddleware(auth, { hasOrgRole: ['admin'] }), async (c) => {
	return c.json({ message: 'Admin access granted' });
});
```

### `src/web/auth-client.ts` - React Client

```typescript
import { createAuthClient } from '@agentuity/auth/react';

export const authClient = createAuthClient();
export const { useSession, signIn, signUp, signOut } = authClient;
```

### `src/web/App.tsx` - Provider Setup

```tsx
import { AgentuityProvider } from '@agentuity/react';
import { AuthProvider } from '@agentuity/auth/react';
import { authClient } from './auth-client';

export function App() {
	return (
		<AgentuityProvider>
			<AuthProvider authClient={authClient}>{/* Your app */}</AuthProvider>
		</AgentuityProvider>
	);
}
```

## Setup

### 1. Database

Auth tables are stored in your Postgres database. Re-export the Agentuity Auth schema, then apply it with Drizzle Kit:

```typescript
// src/schema.ts
export * from '@agentuity/auth/schema';
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/schema.ts',
	dbCredentials: { url: databaseUrl },
});
```

```bash
bunx drizzle-kit push
```

### 2. Environment Variables

```bash
# Required
DATABASE_URL="postgresql://..."

# Optional (defaults to dev secret)
AGENTUITY_AUTH_SECRET="your-32-char-secret"
```

For local browser auth, put the callback URL in `.env.local`:

```env
BETTER_AUTH_URL="http://127.0.0.1:3500"
```

### 3. Install Dependencies

```bash
bun install
```

### 4. Run Development Server

```bash
bun dev
```

## Authentication Methods

### Session (Cookie-based)

Default for browser clients. Uses `better-auth` session cookies.

```typescript
// Sign up
await signUp.email({ email, password, name });

// Sign in
await signIn.email({ email, password });

// Sign out
await signOut();

// Check session
const { data: session } = useSession();
```

### API Key

For programmatic access. Enable with `enableSessionForAPIKeys: true` (default).

```bash
# Using API key header
curl -H "x-api-key: YOUR_API_KEY" https://your-app.agentuity.cloud/api/me
```

Both methods produce the same `c.var.auth` context in routes.

## Available Scripts

| Command             | Description               |
| ------------------- | ------------------------- |
| `bun dev`           | Start development server  |
| `bun run build`     | Build for production      |
| `bun run typecheck` | Run TypeScript checks     |
| `bun run deploy`    | Deploy to Agentuity cloud |

## Learn More

- [Agentuity Auth Documentation](https://agentuity.dev/frontend/authentication)
- [BetterAuth Documentation](https://better-auth.com/docs)
- [Agentuity SDK](https://github.com/agentuity/sdk)
