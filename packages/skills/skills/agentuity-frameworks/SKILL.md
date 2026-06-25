---
name: agentuity-frameworks
description: >-
  Use when adding Agentuity code to a framework app and choosing where routes,
  pages, server functions, config, or service clients belong. Covers Next.js,
  Nuxt, SvelteKit, Astro, Hono, React Router, Vite with React, and TanStack Start
  file placement.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Framework Placement

Agentuity works with your framework's normal file layout. Put routes, pages,
server functions, and config where the framework expects them. Add Agentuity
clients only in server-side code.

## Create-Supported Frameworks

`agentuity create` can scaffold these frameworks:

| Framework | API route location | App UI location | Dev script owner |
|---|---|---|---|
| Next.js | `src/app/api/<name>/route.ts` | `src/app/page.tsx` | Next.js |
| Nuxt | `server/api/<name>.get.ts` or `.post.ts` | `app/app.vue` | Nuxt |
| SvelteKit | `src/routes/<path>/+server.ts` | `src/routes/+page.svelte` | Vite/SvelteKit |
| Astro | `src/pages/api/<name>.ts` | `src/pages/index.astro` | Astro |
| Hono | `src/index.ts` route handlers | `src/landing.tsx` when scaffolded | Hono server script |

Use the framework's route handler to validate the request, then call a shared function for the real work.

## Existing-App Adoption

For apps you already have, install the CLI and import the project without changing the app shape:

```bash
npm install -D @agentuity/cli
agentuity project import --name existing-app --confirm
```

Useful route locations:

| Framework | Server route shape |
|---|---|
| React Router | `app/routes/api.agentuity.ts`, registered in `app/routes.ts` |
| TanStack Start | `src/routes/api.agentuity.tsx` with server handlers |
| Vite + React | A server boundary such as `server.ts`; browser code calls that server |
| Express or other routers | Existing route module; import Agentuity clients server-side |

## Server-Only Rule

Do not expose Agentuity SDK keys to browser bundles. Service clients belong in
routes, server actions, workers, scripts, or other server-only modules.

```typescript
import { KeyValueClient } from '@agentuity/keyvalue';

const kv = new KeyValueClient();

export async function GET(): Promise<Response> {
  const result = await kv.get<{ checkedAt: string }>('health', 'latest');
  return Response.json({ ok: true, exists: result.exists });
}
```

Browser components should call your server route:

```typescript
const response = await fetch('/api/agentuity-health');
const status = await response.json();
```

## Thin Route, Shared Function

Prefer this split for AI features, background work, and service calls:

```typescript
// lib/triage.ts
export async function triageMessage(message: string): Promise<{ priority: string }> {
  return { priority: message.includes('urgent') ? 'high' : 'normal' };
}
```

```typescript
// framework route file
import { triageMessage } from '@/lib/triage';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { message?: string };
  if (!body.message) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  const result = await triageMessage(body.message);
  return Response.json(result);
}
```

This keeps route-specific code small and lets the core function move between
frameworks, tests, queues, schedules, and scripts.

## Hono Middleware Option

In Hono apps, use direct clients by default when portability matters. Use
`@agentuity/hono` when accessing clients through Hono context improves
readability:

```typescript
import { Hono } from 'hono';
import { agentuity } from '@agentuity/hono';
import type { Services } from '@agentuity/hono';

const app = new Hono<{ Variables: Pick<Services, 'kv'> }>();

app.use('*', agentuity());

app.get('/api/preferences/:userId', async (c) => {
  const result = await c.var.kv.get('preferences', c.req.param('userId'));
  return c.json({ exists: result.exists });
});
```

AI Gateway, database, object storage, webhooks, and Coder are direct clients.

## Common Mistakes

| Mistake | Better approach |
|---|---|
| Putting service clients in browser components | Call a server route that owns the client |
| Adding new folders that bypass framework conventions | Use the framework's route/page locations |
| Duplicating AI or service logic in every route | Put shared work in a plain function and import it |
| Assuming every framework uses the same API route path | Check the route table before editing |
| Putting SDK keys in public env prefixes | Keep `AGENTUITY_SDK_KEY` server-side |

## Useful Docs

- Frameworks: https://agentuity.dev/frameworks
- Project structure: https://agentuity.dev/get-started/project-structure
- Add to existing app: https://agentuity.dev/get-started/import-existing-app
- Standalone packages: https://agentuity.dev/reference/standalone-packages
