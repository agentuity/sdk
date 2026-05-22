# @agentuity/migrate

CLI tool to migrate Agentuity SDK projects between major versions. Auto-detects the source version from `package.json` and runs the right migration; supports being chained (v1 → v2 → v3) in a single invocation when needed.

## Usage

```bash
npx @agentuity/migrate [project-dir] [options]
```

Run in your project root, or pass a path. The tool refuses to make changes if your **git worktree is dirty** — commit or stash first, then re-run. Every transform is then visible via `git diff`, so you can always review or roll back with `git checkout .`.

## Options

| Flag | Description |
|---|---|
| `--yes`, `-y` | Skip interactive confirmation prompts |
| `--dry-run` | Print the migration report without modifying files |
| `--v1-to-v2` | Force v1 → v2 migration mode (skip auto-detection) |
| `--v2-to-v3` | Force v2 → v3 migration mode (skip auto-detection) |
| `--help`, `-h` | Show help |

### Auto-detection

The tool reads `package.json` and picks the migration based on the version of `@agentuity/runtime`:

- `@agentuity/runtime ^1.x` → v1 → v2 migration
- `@agentuity/runtime ^2.x` → v2 → v3 migration
- otherwise: prints a hint and exits

Use `--v1-to-v2` or `--v2-to-v3` to override detection (useful for v1 → v3 chains: run with `--v1-to-v2` first, commit, then run again).

---

## v1 → v2

v2 introduced a more declarative architecture: agents are explicitly imported, routes are explicitly composed, and the configuration story collapsed onto `createApp()`.

### Auto-applied transforms

| Finding | Action |
|---|---|
| `src/generated/` directory | Deleted |
| `bootstrapRuntimeEnv()` call in `app.ts` | Removed (`createApp()` handles it) |
| v1 `createRouter()` with mutating `.get()/.post()` calls | Rewritten to `new Hono<Env>()` chained style |
| Missing `src/api/index.ts` barrel | Generated from discovered route files |
| Missing `src/agent/index.ts` barrel | Generated from discovered agent files |
| `@agentuity/*` deps still on `^1.x` | Updated to `^2.0.0` |

### Guided (you review the comment, apply by hand)

| Finding | What you'll see |
|---|---|
| `setup` in `createApp()` | A migration comment explaining where to move env-independent init |
| `shutdown` in `createApp()` | A pointer to `registerShutdownHook()` from `@agentuity/runtime` |
| `agentuity.config.ts` with Vite-only keys | Guidance to create `vite.config.ts` with the right plugins |
| `agentuity.config.ts` with analytics/workbench | Move those into `createApp()` and delete the file |
| Frontend code using `createClient`/`useAPI`/`RPCRouteRegistry` from `@agentuity/react` | Replace with `hc<AppRouter>()` from `hono/client` |

---

## v2 → v3

v3 dropped the `@agentuity/runtime` runtime entirely. Projects bring their own framework (Next.js, Hono, SvelteKit, Astro, etc.) and call Agentuity service clients directly. The migration converts the v2 `createApp()` shape into a plain framework app + standalone service-client imports.

### Auto-applied transforms

| Finding | Action |
|---|---|
| `app.ts` calling `createApp({ agents, router })` | Replaced with a plain Hono app wired up via `@agentuity/hono` middleware |
| Agent files using `createAgent()` | Converted to plain exported async functions |
| `ctx.kv` / `ctx.queue` / `ctx.vector` / etc. inside agents/routes | Rewritten to direct imports from `@agentuity/keyvalue`, `@agentuity/queue`, `@agentuity/vector`, ... |
| `c.var.kv` / `c.var.queue` / etc. inside Hono routes | Same: rewritten to direct service-client imports |
| `src/agent/index.ts` barrel | Deleted (agents are no longer registered with a runtime) |
| Service singletons | New `src/services.ts` file with one `Client` per service the project actually uses |
| `app.ts` (v2 entry point) | Deleted; new `src/index.ts` becomes the entry |
| `agentuity.config.ts` | Deleted (v3 has no SDK-side config file — frameworks own their own config) |
| `package.json` deps | Removes `@agentuity/runtime`, adds `hono` + the service-client packages the project actually uses |
| `@agentuity/schema` (`s.string()`, `s.object(...)`, etc.) | Best-effort rewrite to Zod equivalents (`z.string()`, `z.object(...)`); `s.toJSONSchema` is left with a TODO comment for manual review |

### Manual (instructions only)

| Finding | Guidance |
|---|---|
| Setup/shutdown hooks | Move env-independent init to module top level; use `process.on('beforeExit', ...)` for cleanup |
| Workbench | Sunset on v3 — remove the dependency and any `<Workbench />` usage |
| Custom agent-to-agent invocation patterns | v3 has no `ctx.invoke()` — call agents over plain HTTP using your framework's client |

After the v2 → v3 transform completes, the tool runs `bun install` and a typecheck pass so anything left needing manual attention surfaces immediately.

---

## What the transforms cannot do

The migrator is conservative — it will not make a change if the source code shape is ambiguous. When that happens, it prints a clear note in the report and stops on that file. You'll typically see this for:

- Hand-written entry points that don't follow the standard `src/api/*.ts` + `src/agent/*/agent.ts` layout.
- Custom Hono middleware that wraps `c.var.*` access in non-trivial ways.
- Anything that relies on the deleted `@agentuity/auth`, `@agentuity/react`, `@agentuity/frontend`, `@agentuity/workbench`, or `@agentuity/evals` packages — those have no v3 equivalent and the SDK can't pick one for you.

For these cases, the report links to the v3 docs (https://agentuity.dev/) and the relevant package READMEs.

## Safety

- **Won't run on a dirty worktree.** Commit or stash first.
- **Idempotent** — re-running on an already-migrated project is a no-op (every transform checks for v3 markers before applying).
- **`--dry-run`** prints the full report without writing anything.
