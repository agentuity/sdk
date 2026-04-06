# @agentuity/migrate

CLI tool to migrate Agentuity SDK projects from v1 to v2.

## What's Changed in v2

v2 introduces six fundamental architectural changes:

### 1. Agents are Declarative

**v1**: Agents were auto-discovered from `src/agent/*/agent.ts` files at runtime.

**v2**: Agents must be explicitly imported and passed to `createApp()`:

```typescript
import { createApp } from '@agentuity/runtime';
import * as agents from './agent'; // Barrel export

export default createApp({
  agents, // Explicit declaration
});
```

### 2. No More setup/shutdown Hooks

**v1**: Lifecycle hooks in `createApp()`:

```typescript
createApp({
  setup: async (ctx) => { /* initialize */ },
  shutdown: async (ctx) => { /* cleanup */ }
});
```

**v2**: Use standard patterns:
- **Initialization**: Module-level code (runs when file loads)
- **Cleanup**: Hono middleware or Bun's `process.on('beforeExit', ...)`

### 3. Router is Required

**v1**: File-based auto-discovery — routes in `src/api/*.ts` were automatically mounted.

**v2**: You must explicitly provide a router to `createApp()`:

```typescript
import router from './api'; // Your Hono router

export default createApp({
  router, // Required — no more auto-discovery
});
```

The old file-based approach no longer works. Routes must be composed into a barrel (`src/api/index.ts`) and exported as a Hono instance.

### 4. Use Hono Directly (No createRouter)

**v1**: `createRouter()` was a wrapper around Hono:

```typescript
import { createRouter } from '@agentuity/runtime';

const router = createRouter();
router.get('/hello', async (c) => c.json({ msg: 'hi' }));
```

**v2**: Use Hono directly with chained methods:

```typescript
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';

const router = new Hono<Env>()
  .get('/hello', async (c) => c.json({ msg: 'hi' }));
```

### 5. React Helpers Removed

**v1**: `@agentuity/react` exported `createClient`, `useAPI`, `RPCRouteRegistry` for API calls.

**v2**: These are removed. Use your preferred data fetching library:
- **Hono client directly**: `hc<AppRouter>()` from `hono/client`
- **TanStack Query**: Combine with Hono client for caching, background updates
- **SWR**: Stale-while-revalidate pattern
- **RTK Query**: If already using Redux Toolkit

Example with TanStack Query:

```typescript
import { useQuery } from '@tanstack/react-query';
import { hc } from 'hono/client';
import type { AppRouter } from '../api';

const client = hc<AppRouter>('/api');

function useHello() {
  return useQuery({
    queryKey: ['hello'],
    queryFn: async () => {
      const res = await client.hello.$get();
      return res.json();
    },
  });
}
```

### 6. Standard vite.config.ts

**v1**: Vite config lived inside `agentuity.config.ts` along with workbench settings.

**v2**: Use standard `vite.config.ts` for build config; runtime settings go in `createApp()`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()], // Add your frontend framework's plugin
});
```

```typescript
// app.ts
import { createApp } from '@agentuity/runtime';

export default createApp({
  analytics: true,
  workbench: true,
});
```

> **Note**: v2 doesn't include a default Vite plugin. You must add the plugin for your frontend framework (React, Vue, Svelte, Solid, etc.).

---

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
| `shutdown` in `createApp()` | Guidance to use Hono's lifecycle hooks instead |
| No `router`/`agents` in `createApp()` | Guidance shown — wire up the generated barrels |
| `agentuity.config.ts` has Vite keys | Guidance to create `vite.config.ts` with plugins/define/render/bundle |
| `agentuity.config.ts` has analytics/workbench | Remove — keep only in `createApp()` |
| `agentuity.config.ts` empty | Can be deleted |

### Manual (instructions only, no auto-transform)

| Finding | Guidance |
|---|---|
| Frontend files using `createClient`, `useAPI`, `useAgentuity`, `RPCRouteRegistry` etc. | Replace with `hc<AppRouter>()` from `hono/client` or your preferred data fetching library |

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
- v2: Use Hono's standard patterns — module-level initialization and Hono lifecycle hooks
