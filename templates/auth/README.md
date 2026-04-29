# {{PROJECT_NAME}}

An Agentuity project with [Better Auth](https://better-auth.com) wired up: auth routes, Postgres-backed sessions, and a protected API route. The Drizzle schema is set up so you can add your own tables alongside Better Auth's.

## What you get

- ✅ **Better Auth** - email + password auth via `@agentuity/auth`
- ✅ **Postgres + Drizzle** - one shared client. Add your own tables in `src/schema.ts`
- ✅ **`/api/auth/*`** - sign-up, sign-in, sign-out, sessions
- ✅ **`/api/me`** - protected route that returns the signed-in user
- ✅ **Better Auth UI** - drop-in sign-in and sign-up screens themed to Agentuity cyan
- ✅ **React frontend** - `<SignedIn>` / `<SignedOut>` gating, sign-out, session detail card

## Project structure

```text
{{PROJECT_NAME}}/
├── src/
│   ├── auth.ts              # createAuth() with drizzleAdapter
│   ├── db.ts                # Shared Drizzle client (Better Auth + your tables)
│   ├── schema.ts            # Re-exports auth schema; add your tables here
│   ├── agent/
│   │   └── index.ts         # Empty agent registry inherited from the base template
│   ├── api/
│   │   └── index.ts         # /api/auth/* routes + protected /api/me
│   └── web/
│       ├── App.tsx          # Auth UI + signed-in panel + session demo
│       ├── App.css          # Tailwind theme tokens (cyan + Better Auth UI)
│       ├── auth-client.ts   # createAuthClient() for the browser
│       ├── frontend.tsx     # AgentuityProvider + AuthProvider wiring
│       └── index.html
├── agentuity.config.ts
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

## Setup

Install dependencies:

```bash
bun install
```

Generate an auth secret:

```bash
openssl rand -hex 32
```

Create `.env` with your Postgres connection and the secret:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
AGENTUITY_AUTH_SECRET=<value-from-openssl>
```

Create `.env.local` with the local Better Auth origin (the URL `agentuity dev` prints):

```bash
AGENTUITY_BASE_URL=http://127.0.0.1:3500
BETTER_AUTH_URL=http://127.0.0.1:3500
```

Apply the database schema (creates Better Auth's tables):

```bash
bunx drizzle-kit push
```

Start the dev server:

```bash
bun run dev
```

Open `http://127.0.0.1:3500` and sign up. After signing in, click **Check session** to call `GET /api/me`.

## Verify

Signed-out session check:

```bash
curl http://127.0.0.1:3500/api/auth/get-session
```

Returns `null`.

Sign up via curl. Better Auth requires a valid `Origin` header on mutating endpoints, so pass one:

```bash
curl -c cookies.txt -b cookies.txt \
  -X POST http://127.0.0.1:3500/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://127.0.0.1:3500' \
  --data '{"email":"you@example.com","password":"password1234","name":"You"}'
```

Call the protected route:

```bash
curl -b cookies.txt http://127.0.0.1:3500/api/me
```

Returns `{ id, name, email, authMethod, memberSince }`.

## Customize

- **Edit auth options**: `src/auth.ts`. `createAuth({ database, ... })` accepts the full Better Auth config.
- **Add your tables**: `src/schema.ts`. Declare them next to the auth schema re-export and reference `user.id` for per-user rows. Run `bunx drizzle-kit push` after schema changes. See AGENTS.md for an example.
- **Add API routes**: `src/api/index.ts`. Apply `createSessionMiddleware(auth)` to any route that should require a signed-in user.
- **Edit the UI**: `src/web/App.tsx`. `<AuthView>`, `<SignedIn>`, and `<SignedOut>` come from [`@daveyplate/better-auth-ui`](https://better-auth-ui.com).

## Deploy

Set the deployed Better Auth origin and your secrets in your Agentuity project:

```bash
agentuity cloud env set "BETTER_AUTH_URL=https://<your-app-host>.agentuity.run" \
  --project-id <project-id>

agentuity cloud env set "DATABASE_URL=postgresql://..." --secret \
  --project-id <project-id>

agentuity cloud env set "AGENTUITY_AUTH_SECRET=..." --secret \
  --project-id <project-id>
```

Deploy:

```bash
bun run deploy -- --confirm
```

## Learn more

- [Agentuity Auth Documentation](https://agentuity.dev/frontend/authentication)
- [Better Auth Documentation](https://better-auth.com/docs)
- [Better Auth UI Documentation](https://better-auth-ui.com)
- [Drizzle ORM Documentation](https://orm.drizzle.team)

## Requirements

- [Bun](https://bun.sh/) v1.0 or higher
- A Postgres database (e.g., `agentuity cloud database create --region use`, Neon, Supabase, RDS)
