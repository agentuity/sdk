# {{PROJECT_NAME}}

A new Agentuity project created with `agentuity create` using Clerk authentication.

## What You Get

A fully configured Agentuity project with:

- ✅ **TypeScript** - Full type safety out of the box
- ✅ **Bun runtime** - Fast JavaScript runtime and package manager
- ✅ **Hot reload** - Development server with auto-rebuild
- ✅ **Example agent** - Sample "hello" agent to get started
- ✅ **React frontend** - Pre-configured web interface with Clerk auth
- ✅ **API routes** - Example API endpoints with protected routes
- ✅ **Type checking** - TypeScript configuration ready to go
- ✅ **Clerk authentication** - Drop-in auth for client and server

## Clerk Authentication Setup

This project uses [Clerk](https://clerk.com) for authentication.

### Initial Setup

1. Create a Clerk account at https://dashboard.clerk.com
2. Create a new application
3. Copy your publishable key and secret key
4. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

5. Add your Clerk keys to `.env`:

```env
AGENTUITY_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### Authentication Features

- **Client-side**: Automatic token injection into API calls via `@agentuity/auth/clerk`
- **Server-side**: Protected routes with Clerk middleware
- **Type-safe**: Full TypeScript support with Clerk user types
- **React hooks**: Access auth state with `useAuth()` hook from `@agentuity/react`

### Client-Side Authentication

Use the `useAuth` hook to access authentication state in your React components:

```typescript
import { useAuth } from '@agentuity/react';

function MyComponent() {
	const { isAuthenticated, authLoading } = useAuth();

	if (authLoading) {
		return <div>Loading...</div>;
	}

	if (!isAuthenticated) {
		return <SignInButton />;
	}

	return <div>Welcome! You're signed in.</div>;
}
```

The `useAuth` hook provides:

- `isAuthenticated` - Boolean indicating if user is authenticated
- `authLoading` - Boolean indicating if auth is still loading
- `authHeader` - The current auth header value
- `setAuthHeader` - Function to update auth header (used internally by auth providers)
- `setAuthLoading` - Function to update loading state (used internally by auth providers)

### Protected Route Example

```typescript
import { createMiddleware } from '@agentuity/auth/clerk';

router.get('/api/profile', createMiddleware(), async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		id: user.id,
		email: user.email,
		name: user.name,
	});
});

// Access Clerk-specific fields via user.raw
router.get('/api/user/metadata', createMiddleware(), async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({
		metadata: user.raw.publicMetadata,
		imageUrl: user.raw.imageUrl,
	});
});

// Access JWT payload via auth.raw
router.get('/api/token-info', createMiddleware(), async (c) => {
	const payload = c.var.auth.raw;
	return c.json({ subject: payload.sub });
});
```

## Project Structure

```
my-app/
├── src/
│   ├── agent/            # Agent definitions
│   │   └── hello/
│   │       ├── agent.ts  # Example agent
│   │       └── index.ts  # Default exports
│   ├── api/              # API definitions
│   │   └── index.ts      # Protected routes example
│   └── web/              # React web application
│       ├── public/       # Static assets
│       ├── App.tsx       # Main React component with Clerk UI
│       ├── frontend.tsx  # Entry point with Clerk provider
│       └── index.html    # HTML template
├── .env.example          # Environment variable template
├── AGENTS.md             # Agent guidelines
├── app.ts                # Application entry point
├── tsconfig.json         # TypeScript configuration
├── package.json          # Dependencies and scripts
└── README.md             # This file
```

## Available Commands

After creating your project, you can run:

### Development

```bash
bun dev
```

Starts the development server at `http://localhost:3500`

### Build

```bash
bun build
```

Compiles your application into the `.agentuity/` directory

### Type Check

```bash
bun typecheck
```

Runs TypeScript type checking

### Deploy to Agentuity

```bash
bun run deploy
```

Deploys your application to the Agentuity cloud

## Next Steps

After creating your project:

1. **Set up Clerk** - Follow the authentication setup steps above
2. **Test authentication** - Sign in via the web UI and access protected routes
3. **Customize the example agent** - Edit `src/agent/hello/agent.ts`
4. **Add new agents** - Create new folders in `src/agent/`
5. **Add protected APIs** - Create new routes in `src/api/` with Clerk middleware
6. **Customize the UI** - Edit `src/web/App.tsx` to add your features
7. **Configure your app** - Modify `app.ts` to add middleware, configure services, etc.

## Creating Custom Agents

Create a new agent by adding a folder in `src/agent/`:

```typescript
// src/agent/my-agent/agent.ts
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	description: 'My amazing agent',
	schema: {
		input: s.object({
			name: s.string(),
		}),
		output: s.string(),
	},
	handler: async (_ctx, { name }) => {
		return `Hello, ${name}! This is my custom agent.`;
	},
});

export default agent;
```

## Adding API Routes

Create custom routes in `src/api/`:

```typescript
// src/api/my-agent/route.ts
import { createRouter } from '@agentuity/runtime';
import { createMiddleware } from '@agentuity/auth/clerk';
import myAgent from './agent';

const router = createRouter();

// Public route
router.get('/public', async (c) => {
	const result = await myAgent.run({ message: 'Hello!' });
	return c.json(result);
});

// Protected route
router.post('/', createMiddleware(), myAgent.validator(), async (c) => {
	const user = await c.var.auth.getUser();
	const data = c.req.valid('json');
	const result = await myAgent.run(data);
	return c.json({ user: user.email, result });
});

export default router;
```

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Clerk Documentation](https://clerk.com/docs)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)

## Requirements

- [Bun](https://bun.sh/) v1.0 or higher
- TypeScript 5+
- Clerk account (for authentication)
