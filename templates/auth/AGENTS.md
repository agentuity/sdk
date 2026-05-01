# Agent Guidelines for {{PROJECT_NAME}}

## Commands

- **Build**: `bun run build` (compiles your application)
- **Dev**: `bun run dev` (starts development server at `http://127.0.0.1:3500`)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Deploy**: `bun run deploy` (deploys your app to the Agentuity cloud)
- **DB push**: `bunx drizzle-kit push` (apply schema changes to your Postgres)
- **DB studio**: `bunx drizzle-kit studio` (browse rows in your Postgres)

## Agent-Friendly CLI

The Agentuity CLI is designed to be agent-friendly with programmatic interfaces, structured output, and comprehensive introspection.

Read the [AGENTS.md](./node_modules/@agentuity/cli/AGENTS.md) file in the Agentuity CLI for more information on how to work with this project.

## Instructions

- This project uses Bun instead of NodeJS and TypeScript for all source code
- Auth is wired via [Better Auth](https://better-auth.com) through `@agentuity/auth`

## Auth architecture

One Drizzle client serves both Better Auth's tables and your own (the "Bring Your Own Drizzle" pattern).

**File Structure:**

- `src/db.ts` - Builds one Drizzle client lazily via `createPostgresDrizzle({ connectionString, schema })`
- `src/auth.ts` - Wraps that client with `drizzleAdapter` and passes it to `createAuth`
- `src/schema.ts` - Re-exports `@agentuity/auth/schema` so drizzle-kit sees Better Auth's tables. Add your own tables here
- `src/api/index.ts` - Registers `/auth/*` with `mountAuthRoutes` and `/me` with `createSessionMiddleware`. The router is mounted under `/api` in `app.ts`, so the served URLs are `/api/auth/*` and `/api/me`
- `src/agent/index.ts` - Inherited from the base template and intentionally empty. Add agents only if this app needs them

## Adding your own tables

Declare them in `src/schema.ts` next to the auth schema re-export. Reference `user.id` for per-user rows. Run `bunx drizzle-kit push` after schema changes.

```typescript
import { pgTable, text, timestamp } from '@agentuity/drizzle';
import { user } from '@agentuity/auth/schema';

export const note = pgTable('note', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	body: text('body').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

## Adding protected routes

Apply `createSessionMiddleware(auth)` to any route that should require a signed-in user. The middleware sets `c.var.auth.getUser()` and `c.var.auth.authMethod`.

```typescript
import { createSessionMiddleware } from '@agentuity/auth';
import { auth } from '../auth';

api.get('/profile', createSessionMiddleware(auth), async (c) => {
	const user = await c.var.auth.getUser();
	return c.json({ email: user.email });
});
```

This serves at `GET /api/profile`. The `/api` prefix comes from `app.ts`, where the router is mounted.

For optional auth (route works signed in or out), pass `{ optional: true }`.

## Web Frontend (src/web/)

The `src/web/` folder contains your React frontend, which is automatically bundled by the Agentuity build system.

**File Structure:**

- `index.html` - Main HTML file with `<script type="module" src="./frontend.tsx">`
- `frontend.tsx` - Entry point that wires `AgentuityProvider` and `AuthProvider`
- `auth-client.ts` - `createAuthClient()` from `@agentuity/auth/react`
- `App.tsx` - Main React component. Renders `<AuthView>` (Better Auth UI's sign-in form) when signed out, and a profile + protected-route demo when signed in
- `App.css` - Tailwind theme tokens for Agentuity cyan and Better Auth UI

**Key Points:**

- `<AuthUIProvider>` from `@daveyplate/better-auth-ui` accepts the `authClient`. Wrap any auth UI in it.
- `<AuthView pathname={...}>` renders the right form (sign-in / sign-up / forgot-password / etc.) based on the current pathname.
- `useAuthenticate()` returns `{ user, isPending }` for the signed-in user.
- An `<AuthSwitch>` wrapper (App.tsx) keeps the previous auth state visible during `isPending` refetches, so the layout doesn't collapse on sign-in or sign-out.

## Environment variables

| Variable | Required | Where set | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | `.env` (local), `agentuity cloud env set --secret` | Postgres connection string. Used by both Better Auth and your Drizzle client. |
| `AGENTUITY_AUTH_SECRET` | yes | `.env`, `agentuity cloud env set --secret` | Generate via `openssl rand -hex 32`. Used to sign session cookies. |
| `BETTER_AUTH_URL` | yes | `.env.local` (local), `agentuity cloud env set` | The deployed app's origin. Better Auth rejects mismatched origins. |
| `AGENTUITY_BASE_URL` | local dev | `.env.local` | The local URL `agentuity dev` prints. |

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Better Auth Documentation](https://better-auth.com/docs)
- [Better Auth UI Documentation](https://better-auth-ui.com)
- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
