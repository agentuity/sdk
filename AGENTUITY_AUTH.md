# Agentuity Auth - Implementation Plan & Design Decisions

> **Status**: Phase 1, 2, 3 & 4 Complete  
> **Last Updated**: 2024-12-26

## Overview

A **first-class auth service for developers** building apps and agents on Agentuity cloud. This provides authentication and authorization using [BetterAuth](https://better-auth.com/) as the foundation, with zero-config defaults that "just work".

### What This Is

- An auth service for **developer's applications and their users**
- Tables live in the **developer's own Postgres database** (provisioned via `agentuity cloud db create`)
- A thin wrapper over BetterAuth so developers can customize everything
- NOT Agentuity's internal identity system

### Key Principles

1. **Single file config** - One `auth.ts` in the user's project
2. **No agent registration** - Agents use caller's auth context, not their own identity
3. **Developer's database** - Auth tables in their Postgres, not Agentuity infra
4. **End-to-end type safety** - Types flow from BetterAuth config through to client/server
5. **Extensible** - Developers can add any BetterAuth plugin

---

## Architecture

```
Developer's Agentuity Project
├── src/auth.ts           # Single auth config file
├── src/auth-client.ts    # BetterAuth React client (created by user)
├── routes/auth/*         # BetterAuth handler routes
├── agents/*.ts           # Use withSession() for protected agents
└── web/App.tsx           # Wrap with AgentuityBetterAuth

@agentuity/auth/agentuity
├── index.ts              # Core exports (no BetterAuth client imports)
├── config.ts             # createAgentuityAuth() / withAgentuityAuth()
├── server.ts             # createMiddleware(), requireScopes()
├── client.tsx            # AgentuityBetterAuth (generic token bridge)
├── react.ts              # BetterAuth React client with Agentuity defaults
├── agent.ts              # withSession() unified wrapper
├── types.ts              # Shared types
├── migrations.ts         # ensureAuthSchema(), AGENTUITY_AUTH_BASELINE_SQL
└── api-key-storage.ts    # KV adapter for BetterAuth API key plugin

Developer's Postgres DB (via agentuity cloud db)
├── user, session, account, verification  # BetterAuth core
├── organization, member, invitation      # Org plugin
├── jwks                                  # JWT plugin
└── apiKey                                # API Key plugin
```

---

## Design Decisions & Reasoning

### 1. BetterAuth as Optional Peer Dependency

**Decision**: Keep `better-auth` as an optional peer dependency, not a direct dependency.

**Reasoning**:

- Developers using Clerk or Auth0 shouldn't have `better-auth` installed
- Same pattern as existing Clerk/Auth0 peer deps
- Tree-shakable: BetterAuth only resolves when user imports from `/agentuity` subpaths
- Version alignment is the app's responsibility (avoids Agentuity being a "version gatekeeper")

**Trade-off**: If a user imports `@agentuity/auth/agentuity/react` without installing `better-auth`, they'll get a build/runtime error. This is acceptable and should be documented.

### 2. Single Context Pattern (c.var.auth only)

**Decision**: Only expose `c.var.auth` on Hono context, not BetterAuth's native `c.var.user` / `c.var.session`.

**Reasoning**:

- Consistent API across all auth providers (Clerk, Auth0, Agentuity)
- Provider-agnostic shape makes swapping providers easier
- Less coupling to BetterAuth internals
- Single canonical way to access auth in route handlers

**Access Pattern**:

```typescript
const user = await c.var.auth.getUser(); // Returns user or null
const token = await c.var.auth.getToken(); // Returns token or null
const raw = c.var.auth.raw; // Raw BetterAuth session data
```

### 3. The "Two Hooks" Problem - Resolved

**Problem**: With BetterAuth + Agentuity, there appear to be two auth hooks:

- `useSession()` from BetterAuth - knows about user identity
- `useAuth()` from `@agentuity/react` - knows about auth header for API calls

**Resolution**: This is the SAME pattern as Clerk integration. The hooks serve different purposes:

| Hook                        | Purpose                                                 | Who Uses It                           |
| --------------------------- | ------------------------------------------------------- | ------------------------------------- |
| BetterAuth's `useSession()` | User identity, session state, "am I logged in?"         | **App developers**                    |
| Agentuity's `useAuth()`     | Transport layer - "does Agentuity have an auth header?" | **Bridge components only** (internal) |

### 4. Framework-Specific Client Imports

**Decision**: Isolate framework-specific BetterAuth clients to dedicated subpaths.

**Reasoning**:

- `react.ts` imports from `better-auth/react` - it's React-specific
- Svelte users shouldn't pull in React code
- Each framework gets its own subpath (future: `/agentuity/svelte`, `/agentuity/vue`)

### 5. Unified `withSession` Wrapper (Phase 4)

**Decision**: Replace separate `withAuth` and `withOrg` with a single `withSession` wrapper.

**Reasoning**:

- **Simplicity**: One wrapper to learn, one context shape
- **Works everywhere**: HTTP requests, agent-to-agent calls, cron jobs, standalone invocations
- **Automatic propagation**: Auth context flows automatically between agent calls via `AgentContext.state`
- **Graceful degradation**: Returns `null` for auth/org when not available (e.g., cron jobs)

**How It Works**:

```
HTTP Request → createHonoMiddleware (sets c.var.auth)
     ↓
Agent A calls withSession → resolves auth from c.var.auth → caches in AgentContext.state
     ↓
Agent A calls Agent B → same AgentContext (shared via AsyncLocalStorage)
     ↓
Agent B calls withSession → finds cached auth → uses it automatically
```

**Why Not Separate Wrappers**:

- `withAuth` + `withOrg` would require developers to understand two APIs
- Both need the same underlying auth resolution logic
- Organization context depends on auth context anyway

### 6. BetterAuth API Key Plugin Integration (Phase 4)

**Decision**: Use BetterAuth's native API Key plugin with `enableSessionForAPIKeys: true`.

**Reasoning**:

- **No custom tables**: BetterAuth handles the `apiKey` table schema
- **Unified auth flow**: API keys produce mock sessions, so `createHonoMiddleware` handles both session and API key auth identically
- **Built-in features**: Rate limiting, expiration, permissions, metadata all handled by BetterAuth
- **KV storage option**: Can store keys in Agentuity's Redis-based KV for high-performance lookups

**Alternative Considered**: Building a custom `agentuity_api_key` table and middleware. Rejected because:

- Duplicates BetterAuth functionality
- More code to maintain
- Misses out on BetterAuth's rate limiting and permissions features

**Combined Middleware Pattern**:

```typescript
// With enableSessionForAPIKeys: true, this handles BOTH:
app.use('/api/*', createHonoMiddleware(auth));

// Session cookies work ✓
// x-api-key headers work ✓
// Both produce c.var.auth with user context
```

### 7. Database Migration Strategy (Phase 4)

**Decision**: Embed baseline SQL in SDK with runtime `ensureAuthSchema()` helper.

**Reasoning**:

- **Zero CLI dependency**: Works without `agentuity auth init` command
- **Idempotent**: Safe to call at every startup (checks if tables exist first)
- **Single source of truth**: SQL lives in `migrations.ts`, future CLI can reuse it
- **Includes all plugins**: Core tables + organization + JWT + API key

**Alternative Considered**: Requiring `npx @better-auth/cli generate` for migrations. Rejected because:

- Extra step for developers
- BetterAuth CLI may not know about Agentuity-specific tables
- Harder to ensure consistency across projects

**Usage**:

```typescript
import { ensureAuthSchema, createAgentuityAuth } from '@agentuity/auth/agentuity';

const pool = new Pool({ connectionString: DATABASE_URL });
await ensureAuthSchema({ db: pool }); // Safe to call at startup

export const auth = createAgentuityAuth({ database: pool, ... });
```

### 8. OTEL Observability (Phase 4)

**Decision**: Add OpenTelemetry span attributes and events in auth middleware.

**Reasoning**:

- **Debugging**: See auth method, user ID, org ID in traces
- **Correlation**: Agent spans inherit request span attributes
- **Security auditing**: Events for `auth.unauthorized`, `auth.scope_check.forbidden`

**Attributes Added**:

- `auth.user.id` - User identifier
- `auth.user.email` - User email
- `auth.method` - `'session'` or `'api-key'`
- `auth.provider` - `'BetterAuth'`
- `auth.org.id` - Active organization (if set)

### 9. KV Storage for API Keys (Phase 4)

**Decision**: Provide `createAgentuityApiKeyStorage()` adapter for BetterAuth's `secondaryStorage` as the default.

**Reasoning**:

- **Performance**: Redis-based KV is faster than Postgres for key lookups
- **Agentuity integration**: Uses existing Agentuity cloud KV infrastructure
- **Default behavior**: Secondary storage is the default with database fallback

**Storage Modes**:

```typescript
// Default: KV storage with database fallback (recommended)
const auth = createAgentuityAuth({
	database: pool,
	secondaryStorage: createAgentuityApiKeyStorage({ kv: ctx.kv }),
});

// Option: Database only (no KV)
const auth = createAgentuityAuth({
	database: pool,
	apiKey: {
		storage: 'database',
	},
});
```

### 10. Extensibility Model

**Decision**: Expose raw BetterAuth data for custom extensions while providing sensible defaults.

**How Users Extend**:

1. **Access raw data**: `c.var.auth.raw` in routes or `ctx.auth` in agents contains full BetterAuth session/user
2. **Add BetterAuth plugins**: `createAgentuityAuth({ plugins: [twoFactor(), passkey()] })`
3. **Custom middleware**: Build on top of `c.var.auth` for route-level customization
4. **Custom agent wrappers**: Build on top of `withSession` context for agent-level customization

**Example - Custom org fields**:

```typescript
// BetterAuth stores any org fields in the raw data
const orgMetadata = ctx.auth?.session?.activeOrganization?.metadata;
const customField = orgMetadata?.myCustomField;
```

### 11. API Routes vs Agent Auth

**Decision**: Two complementary patterns for two different use cases.

| Pattern                  | Where      | Purpose                                            |
| ------------------------ | ---------- | -------------------------------------------------- |
| `createMiddleware(auth)` | API routes | Sets `c.var.auth` on Hono context                  |
| `withSession(handler)`   | Agents     | Resolves auth from any source, enables propagation |

**Why Both**:

- **API routes**: Direct HTTP handlers use middleware for simplicity
- **Agents**: May be called from HTTP, other agents, cron, or standalone - need unified auth resolution
- **Agent-to-agent propagation**: `withSession` caches auth in `AgentContext.state`, so nested agent calls inherit auth automatically

**Agent-to-Agent Flow**:

```
HTTP Request → createMiddleware (sets c.var.auth)
     ↓
Agent A → withSession → reads from c.var.auth → caches in AgentContext.state
     ↓
Agent A calls Agent B → same AgentContext (via AsyncLocalStorage)
     ↓
Agent B → withSession → finds cached auth in state → uses it ✓
```

Without `withSession`, developers would need to manually pass auth context between agent calls.

---

## Default Plugins

| Plugin                   | Purpose                     | Enabled by Default |
| ------------------------ | --------------------------- | ------------------ |
| `organization`           | Multi-tenancy, teams        | ✅                 |
| `bearer`                 | Accept Authorization header | ✅                 |
| `jwt`                    | Token signing/verification  | ✅                 |
| `apiKey`                 | Programmatic API access     | ✅                 |
| magic-link, 2FA, passkey | Additional auth methods     | ❌ (user adds)     |

---

## Agent Authentication Model

### Unified `withSession` Wrapper

The `withSession` wrapper provides auth context to agents across ALL execution environments:

| Context        | `auth`          | `org`        | `hasScope()`            |
| -------------- | --------------- | ------------ | ----------------------- |
| HTTP + session | ✅ User+Session | ✅ If active | Based on session scopes |
| HTTP + API key | ✅ Mock session | ✅ If active | Based on key scopes     |
| Agent-to-agent | ✅ Inherited    | ✅ Inherited | Inherited               |
| Cron job       | `null`          | `null`       | Always `false`          |
| Standalone     | `null`          | `null`       | Always `false`          |

### Usage Examples

```typescript
import { createAgent } from '@agentuity/runtime';
import { withSession } from '@agentuity/auth/agentuity';

// Required auth (throws if not authenticated)
export default createAgent('protected-agent', {
	handler: withSession(async ({ auth, org, hasScope }, input) => {
		// auth is guaranteed non-null
		return { userId: auth.user.id, orgId: org?.id };
	}),
});

// Optional auth (allows anonymous)
export default createAgent('public-agent', {
	handler: withSession(
		async ({ auth }, input) => {
			if (auth) {
				return { message: `Hello, ${auth.user.name}!` };
			}
			return { message: 'Hello, anonymous!' };
		},
		{ optional: true }
	),
});

// With scope requirements
export default createAgent('admin-agent', {
	handler: withSession(
		async ({ auth }, input) => {
			// Will throw if user doesn't have 'admin' scope
			return { isAdmin: true };
		},
		{ requiredScopes: ['admin'] }
	),
});
```

### Role-to-Scope Mapping

```typescript
import { createRoleScopeChecker } from '@agentuity/auth/agentuity';

const roleScopes = {
	owner: ['*'],
	admin: ['project:read', 'project:write', 'user:manage'],
	member: ['project:read'],
};

// In withSession handler:
const hasScope = createRoleScopeChecker(org?.role, roleScopes);
if (!hasScope('project:write')) {
	throw new Error('Insufficient permissions');
}
```

---

## Route Protection

### Basic Middleware

```typescript
import { createHonoMiddleware } from '@agentuity/auth/agentuity';

// Require auth
app.use('/api/*', createHonoMiddleware(auth));

// Optional auth
app.use('/api/public/*', createHonoMiddleware(auth, { optional: true }));
```

### Scope-Based Protection

```typescript
import { createMiddleware, requireScopes } from '@agentuity/auth/agentuity';

app.use('/api/*', createMiddleware(auth));

// Require specific scopes
app.post('/api/users', requireScopes(['user:write']), (c) => { ... });
app.delete('/api/users/:id', requireScopes(['user:delete']), (c) => { ... });
```

---

## Implementation Phases

### Phase 1: POC ✅ Complete

- [x] Package structure (`@agentuity/auth/agentuity`)
- [x] `createAgentuityAuth()` with default plugins
- [x] `createMiddleware()` for Hono
- [x] `AgentuityBetterAuth` React component
- [x] `withAuth()` agent wrapper
- [x] 19 passing tests

### Phase 2: End-to-End Integration ✅ Complete

- [x] BetterAuth handler routes (`/api/auth/*`)
- [x] Database migrations (Postgres)
- [x] Login/signup UI
- [x] 28 passing tests

### Phase 2.5: API Refinements ✅ Complete

- [x] Resolved "two hooks" confusion (documented positioning)
- [x] Single context pattern (`c.var.auth` only)
- [x] Framework-specific imports (`/agentuity/react`)
- [x] Optional peer dependency pattern
- [x] Nullable `getUser()` for optional auth

### Phase 3: CLI Integration ✅ Complete

- [x] `agentuity project auth init` command
- [x] `agentuity create` auth integration
- [x] Database selection/creation flow
- [x] Code generation for `auth.ts`
- [x] Auto-run migrations

#### Implementation Summary

**Command Structure:**

```
packages/cli/src/cmd/project/auth/
├── index.ts          # Registers 'project auth' subcommand
├── init.ts           # agentuity project auth init implementation
└── shared.ts         # Shared helpers (reused by both init and create)
```

**Shared Helpers in `shared.ts`:**

| Helper                      | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `selectOrCreateDatabase()`  | Unified DB picker with "use existing" option first   |
| `ensureAuthDependencies()`  | Installs `@agentuity/auth`, `better-auth`, `pg`      |
| `runAuthMigrations()`       | Executes SQL via Catalyst API                        |
| `splitSqlStatements()`      | Splits SQL into individual statements for `dbQuery`  |
| `generateAuthFileContent()` | Returns `src/auth.ts` template content               |
| `printIntegrationExamples()`| Prints wiring examples for middleware, routes, etc.  |

#### Key Design Decisions

**1. Command Naming: `agentuity project auth` (not `agentuity auth`)**

- `agentuity auth` is reserved for CLI login/logout
- `agentuity project auth init` clearly scopes to project-level auth setup

**2. Migration Execution via `splitSqlStatements()`**

The Catalyst `dbQuery` API only supports single SQL statements. The `AGENTUITY_AUTH_BASELINE_SQL` contains multiple `CREATE TABLE` statements, so we split them:

```typescript
const statements = splitSqlStatements(AGENTUITY_AUTH_BASELINE_SQL);
for (const statement of statements) {
	await dbQuery(catalystClient, { database, query: statement, orgId, region });
}
```

**3. DATABASE_URL Ordering in `agentuity create`**

The `createProjectConfig()` function overwrites `.env` with only `AGENTUITY_SDK_KEY`. To preserve `DATABASE_URL`, we write it **after** `createProjectConfig()` completes:

```
1. Auth prompts → capture authDatabaseUrl
2. createProjectConfig() → writes .env with SDK key (overwrites)
3. Append DATABASE_URL → preserves both values
```

**4. Generate `auth.ts`, Print Examples for the Rest**

We only generate `src/auth.ts` programmatically. Route wiring, React provider setup, and agent integration are printed as console examples. This avoids template-specific codegen conflicts (React vs Svelte vs Vue).

---

**`agentuity create` Integration:**

After template download and resource provisioning, the user sees:

```text
? Enable Agentuity Authentication?
  > No, I'll add auth later
    Yes, set up Agentuity Auth (BetterAuth)
```

If "Yes":
1. **Reuse or Create DB** - If a DB was already selected, offer to reuse it
2. **Install Dependencies** - `bun install @agentuity/auth better-auth pg`
3. **Generate `src/auth.ts`** - Server config with middleware export
4. **Run Migrations** - Execute `AGENTUITY_AUTH_BASELINE_SQL`
5. **Write `DATABASE_URL`** - Appended to `.env` after project registration
6. **Print Integration Examples** - At end of create flow

---

**`agentuity project auth init` (Existing Projects):**

```text
$ agentuity project auth init

This will:
  • Ensure you have a Postgres database configured
  • Install @agentuity/auth and better-auth
  • Run database migrations to create auth tables
  • Show you how to wire auth into your API and UI
```

Flow:
1. **Preflight** - Verify `package.json` exists
2. **Database Selection** - Unified picker shows existing DB first (if `DATABASE_URL` found in `.env`)
3. **Install Dependencies** - Only if missing
4. **Generate `src/auth.ts`** - With user confirmation, only if missing
5. **Run Migrations** - With user confirmation (idempotent, safe to re-run)
6. **Print Integration Examples**

---

**Generated `src/auth.ts` Template:**

```typescript
import { Pool } from 'pg';
import { createAgentuityAuth, createMiddleware } from '@agentuity/auth/agentuity';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const auth = createAgentuityAuth({
	database: pool,
	basePath: '/api/auth',
});

export const authMiddleware = createMiddleware(auth);
```

### Phase 4: Advanced Features ✅ Complete

**Unified Agent Wrapper**

- [x] `withSession` replaces `withAuth` + `withOrg`
- [x] Automatic auth propagation between agent calls
- [x] Works in all contexts (HTTP, cron, standalone)
- [x] Role-to-scope mapping helpers (`createRoleScopeChecker`)

**API Key Integration**

- [x] BetterAuth API Key plugin enabled by default
- [x] `enableSessionForAPIKeys: true` for unified auth flow
- [x] KV storage adapter (`createAgentuityApiKeyStorage`)
- [x] Combined session + API key middleware

**Database Migrations**

- [x] `AGENTUITY_AUTH_BASELINE_SQL` with all table definitions
- [x] `ensureAuthSchema()` runtime helper (idempotent)
- [x] Includes API Key plugin schema

**Observability**

- [x] OTEL span attributes for user/org/auth method
- [x] Events for unauthorized/forbidden
- [x] Exception recording for auth failures

**Scope Middleware**

- [x] `requireScopes()` Hono middleware
- [x] Custom scope extraction support
- [x] OTEL events for scope checks

### Phase 5: Documentation

- [ ] Developer guide
- [ ] API reference
- [ ] Examples: Multi-tenant SaaS, API key auth

#### Documentation Plan (for implementation)

**5.1 Developer Guide (~1500-2500 words)**

Structure:

1. Introduction & When to Use (vs Clerk/Auth0)
2. Quickstart: Happy Path Setup (Hono + React + Postgres + KV)
   - Install deps, database & migrations, auth routes, middleware, client bridge
3. Protecting API Routes (`createMiddleware`, optional auth)
4. Scope-Based Route Protection (`requireScopes`)
5. Protecting Agents with `withSession`
6. Multi-Tenant SaaS with Organizations
7. Programmatic Access with API Keys
8. Configuration & Customization
9. Reference to BetterAuth Docs

**5.2 API Reference**

Group by concern:

- **Config**: `createAgentuityAuth`, `withAgentuityAuth`, `getDefaultPlugins`, `DEFAULT_API_KEY_OPTIONS`
- **Migrations**: `ensureAuthSchema`, `AGENTUITY_AUTH_BASELINE_SQL`
- **API Key Storage**: `createAgentuityApiKeyStorage`, `AGENTUITY_API_KEY_NAMESPACE`
- **Server/Hono**: `createMiddleware`, `requireScopes`
- **Client/React**: `AgentuityBetterAuth` component
- **Agents**: `withSession`, `createScopeChecker`, `createRoleScopeChecker`
- **Types**: `AgentuityAuthContext`, `AgentuityOrgContext`, `WithSessionContext`

**5.3 Example: Multi-Tenant SaaS**

- Org-aware agents with `withSession`
- Role-to-scope mapping with `createRoleScopeChecker`
- Enforcing org scoping in queries

**5.4 Example: API Key Auth**

- Issuing API keys (admin-only agent)
- Combined session + API key middleware
- Scope enforcement with API keys
- Client usage (curl, fetch)

**Key Guidelines:**

- Focus on single canonical stack (Hono + React + Postgres + KV)
- Link to BetterAuth docs for underlying features (don't re-document)
- Validate all code snippets against actual exports
- Include troubleshooting section (missing peer deps, migration issues)

---

## Testing

```bash
bun test packages/auth/test/agentuity/
```

Test files:

- `server.test.ts` - Hono middleware tests
- `withSession.test.ts` - Scope checker tests
- `requireScopes.test.ts` - Scope middleware tests
- `migrations.test.ts` - Database migration tests
- `api-key-storage.test.ts` - KV adapter tests
- `e2e.test.ts` - Integration flow tests

---

## References

- [BetterAuth Docs](https://better-auth.com/docs)
- [BetterAuth API Key Plugin](https://better-auth.com/docs/plugins/api-key)
- [BetterAuth GitHub](https://github.com/better-auth/better-auth)
- [Existing Clerk Provider](packages/auth/src/clerk/)
- [Existing Auth0 Provider](packages/auth/src/auth0/)
