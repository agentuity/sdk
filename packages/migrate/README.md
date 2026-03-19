# @agentuity/migrate

CLI tool to migrate Agentuity SDK projects from v1 to v2.

## Usage

```bash
npx @agentuity/migrate [project-dir] [options]
```

Run in your project root (or pass a path). The tool checks that your **git worktree is clean** before touching anything, so you can always `git diff` to review changes or `git checkout .` to roll back.

## Options

| Flag | Description |
|---|---|
| `--yes`, `-y` | Skip interactive confirmation |
| `--dry-run` | Print the migration report without modifying files |
| `--help`, `-h` | Show help |

## What it migrates

### Auto-fixable (fully automated)

| Finding | Action |
|---|---|
| `src/generated/` directory | Deleted |
| `bootstrapRuntimeEnv()` call in `app.ts` | Removed (createApp handles it) |
| v1 `createRouter()` + mutating `.get()/.post()` route files | Rewritten to `new Hono<Env>()` chained style |
| Missing `src/api/index.ts` barrel | Generated from discovered route files |
| Missing `src/agent/index.ts` barrel | Generated from discovered agent files |

### Guided (applied with your review)

| Finding | What happens |
|---|---|
| `setup` in `createApp()` | Migration comment added — move init to module level |
| `shutdown` in `createApp()` | Migration comment added — replace with `registerShutdownHook()` |
| No `router`/`agents` in `createApp()` | Guidance shown — wire up the generated barrels |
| `agentuity.config.ts` has Vite keys | Guidance to create `vite.config.ts` with plugins/define/render/bundle |
| `agentuity.config.ts` has analytics/workbench | Remove — keep only in `createApp()` |
| `agentuity.config.ts` empty | Can be deleted |

### Manual (instructions only, no auto-transform)

| Finding | Guidance |
|---|---|
| Frontend files using `createClient`, `useAPI`, `RPCRouteRegistry` etc. | Replace with `hc<AppRouter>()` from `hono/client` |

## V1 → V2 changes summary

**Configuration (consolidated)**
- v1: Config split between `app.ts` and `agentuity.config.ts`
- v2: **All runtime config in `createApp()`** — analytics, workbench, cors, compression, etc.
- v2: **Vite config in `vite.config.ts`** — plugins, define, render, bundle
- v2: `agentuity.config.ts` is **deprecated** — delete it

**`app.ts` entrypoint**
- v1: thin shell; CLI generated a 500-line `src/generated/app.ts`
- v2: `app.ts` is the real entrypoint; `createApp()` handles all lifecycle

**Routing**
- v1: file-based auto-discovery + `createRouter()` mutating style
- v2: explicit `src/api/index.ts` barrel + `new Hono<Env>()` chained style

**Type-safe API client**
- v1: `createClient<RPCRouteRegistry>()` from `@agentuity/react`
- v2: `hc<AppRouter>()` from `hono/client` — Hono's native RPC inference

**Setup/shutdown lifecycle**
- v1: `createApp({ setup, shutdown })` with generic state via `ctx.app`
- v2: module-level initialisation + `registerShutdownHook()` from `@agentuity/runtime`
