# {{PROJECT_NAME}}

An Agentuity project with built-in authentication using BetterAuth.

## What You Get

A fully configured Agentuity project with:

- ✅ **TypeScript** - Full type safety out of the box
- ✅ **Bun runtime** - Fast JavaScript runtime and package manager
- ✅ **Hot reload** - Development server with auto-rebuild
- ✅ **Example agent** - Sample "hello" agent to get started
- ✅ **React frontend** - Pre-configured web interface with Tailwind CSS
- ✅ **BetterAuth** - Full-featured authentication with email/password, organizations, and API keys
- ✅ **Beautiful Auth UI** - Pre-built sign-in, sign-up, account settings, and more

## Setup

### 1. Create a Database

Create an Agentuity cloud database:

```bash
agentuity cloud database create --region use
```

List your databases to get the connection URL:

```bash
agentuity cloud database list --region use --json
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Set these required variables:

```env
# Database connection URL from step 1
DATABASE_URL=postgresql://...

# Generate a secret: openssl rand -hex 32
BETTER_AUTH_SECRET=your-32-character-secret-here
```

### 3. Run Auth Migrations

Set up the auth tables in your database:

```bash
agentuity auth setup
```

Or run the included SQL directly against your database.

### 4. Start Development

```bash
bun dev
```

Visit `http://localhost:3500` and click "Sign Up" to create your first user!

## Authentication Features

This template includes:

- **Email/Password** - Sign up and sign in with email
- **Organizations** - Create and manage teams
- **API Keys** - Generate keys for programmatic access
- **Account Settings** - Profile, security, and more
- **Protected Routes** - Server-side middleware for API routes

## Project Structure

```
my-app/
├── src/
│   ├── agent/            # Agent definitions
│   │   └── hello/        # Example agent
│   ├── api/              # API routes with auth middleware
│   │   └── index.ts      # Route definitions
│   ├── web/              # React web application
│   │   ├── App.tsx       # Main component with auth UI
│   │   ├── AuthPages.tsx # Auth views (sign-in, settings, etc.)
│   │   ├── auth-client.ts# BetterAuth client
│   │   ├── frontend.tsx  # Entry point with providers
│   │   └── index.css     # Tailwind + theme variables
│   └── auth.ts           # BetterAuth server configuration
├── .env.example          # Environment variable template
├── agentuity.config.ts   # Build config (Tailwind plugin)
└── package.json
```

## Protecting API Routes

Add the `authMiddleware` to require authentication:

```typescript
import { authMiddleware } from '../auth';

// Protected - returns 401 if not authenticated
api.get('/api/profile', authMiddleware, async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({ email: user.email });
});
```

Use `optionalAuthMiddleware` for routes that work with or without auth:

```typescript
import { optionalAuthMiddleware } from '../auth';

api.get('/api/greeting', optionalAuthMiddleware, async (c) => {
	const user = c.var.user;
	if (user) {
		return c.json({ message: `Hello, ${user.name}!` });
	}
	return c.json({ message: 'Hello, guest!' });
});
```

## Available Commands

```bash
bun dev          # Start development server
bun build        # Build for production
bun typecheck    # Run TypeScript type checking
bun run deploy   # Deploy to Agentuity cloud
```

## Auth UI Pages

The template includes these pre-built pages:

| Path                    | Description             |
| ----------------------- | ----------------------- |
| `/auth/sign-in`         | Sign in form            |
| `/auth/sign-up`         | Sign up form            |
| `/auth/forgot-password` | Password reset request  |
| `/account`              | Account settings        |
| `/account/security`     | Password & 2FA settings |
| `/account/api-keys`     | API key management      |
| `/organization`         | Organization settings   |

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [BetterAuth Documentation](https://better-auth.com)
- [Bun Documentation](https://bun.sh/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Hono Documentation](https://hono.dev/)

## Requirements

- [Bun](https://bun.sh/) v1.0 or higher
- TypeScript 5+
- Agentuity cloud database
