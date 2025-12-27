# Agentuity Auth Test App

A canonical example demonstrating **Agentuity Auth** (BetterAuth) integration with the Agentuity runtime.

## What This Demonstrates

- ✅ **BetterAuth Integration** - Full auth setup with `@agentuity/auth/agentuity`
- ✅ **Session & API Key Auth** - Both authentication methods via unified middleware
- ✅ **Protected Routes** - Using `authMiddleware` and `requireScopes()`
- ✅ **Protected Agents** - Using `withSession()` wrapper
- ✅ **React Client** - `AgentuityBetterAuth` provider with `useSession()`
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
import { Pool } from 'pg';
import { createAgentuityAuth, createMiddleware } from '@agentuity/auth/agentuity';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const auth = createAgentuityAuth({
	database: pool,
	secret: process.env.BETTER_AUTH_SECRET,
	basePath: '/api/auth',
	emailAndPassword: { enabled: true },
});

export const authMiddleware = createMiddleware(auth);
export const optionalAuthMiddleware = createMiddleware(auth, { optional: true });
```

### `src/api/index.ts` - Route Protection

```typescript
// BetterAuth routes (signup, signin, signout, session, etc.)
api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

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

// Scope-based protection
api.get('/admin', authMiddleware, requireScopes(['admin']), async (c) => {
	return c.json({ message: 'Admin access granted' });
});
```

### `src/web/auth-client.ts` - React Client

```typescript
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({ baseURL: window.location.origin });
export const { useSession, signIn, signUp, signOut } = authClient;
```

### `src/web/App.tsx` - Provider Setup

```tsx
import { AgentuityProvider } from '@agentuity/react';
import { AgentuityBetterAuth } from '@agentuity/auth/agentuity/client';
import { authClient } from './auth-client';

export function App() {
	return (
		<AgentuityProvider>
			<AgentuityBetterAuth authClient={authClient}>{/* Your app */}</AgentuityBetterAuth>
		</AgentuityProvider>
	);
}
```

## Setup

### 1. Database

Auth tables are stored in your Postgres database. Create them using either:

**Option A: CLI (recommended)**

```bash
agentuity project auth init
```

**Option B: Runtime (auto-migration)**

```typescript
import { ensureAuthSchema } from '@agentuity/auth/agentuity';
await ensureAuthSchema({ db: pool });
```

### 2. Environment Variables

```bash
# Required
DATABASE_URL="postgresql://..."

# Optional (defaults to dev secret)
BETTER_AUTH_SECRET="your-32-char-secret"
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

- [Agentuity Auth Documentation](https://agentuity.dev/docs/auth)
- [BetterAuth Documentation](https://better-auth.com/docs)
- [Agentuity SDK](https://github.com/agentuity/sdk)
