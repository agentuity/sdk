# APIs Folder Guide

This folder contains Hono routes for the docs app and SDK Explorer.

## Route Rules

- Use Hono directly: `new Hono<ApiEnv>()`.
- Import `ApiEnv` from `../context` for route context typing.
- Use `@agentuity/hono` only at the app boundary. Per-route code should read service clients from `c.var.*`.
- Validate request bodies inside the route before calling service clients or shared demo functions.
- Use `c.var.logger` for route logs.
- Keep public code examples aligned with v3 framework patterns. Do not present Explorer-only helpers as the recommended app pattern.
- After adding a route, mount it in `src/api/index.ts`, wire any matching demo config, then run typecheck and the focused route checks.

## Local App Wiring

`src/api/app.ts` creates the Hono API app used by:

- `src/api/dev-server.ts` during local Vite development
- `src/web/server.ts` in the TanStack Start server bundle
- `app.ts` for Agentuity app entry compatibility

Local development runs the API server on port `3001` and Vite proxies `/api` and WebSocket upgrades to it.

## Route Shape

```typescript
import { Hono } from 'hono';
import type { ApiEnv } from '../context';

const router = new Hono<ApiEnv>();

router.get('/', (c) => {
	c.var.logger.info('status check');
	return c.json({ status: 'ok' });
});

router.post('/', async (c) => {
	const body: unknown = await c.req.json();
	// validate body here
	return c.json({ received: body });
});

export default router;
```

## Streaming

Use the local wrappers in `../http`:

- `stream()` for raw text or byte streams
- `sse()` for Server-Sent Events
- `waitUntil()` for background work that should not block the response

WebSocket routes should use Hono's current Bun helper:

```typescript
import { upgradeWebSocket } from 'hono/bun';
```

The Bun server must export/pass Hono's `websocket` handler, which is handled in `src/api/app.ts`, `src/api/dev-server.ts`, and the TanStack Start launch wrapper.

## Do Not Use

- `@agentuity/runtime`
- `createApp()`
- `createRouter()`
- `createAgent()`
- `createAgentContext()`

Those are v2 runtime patterns. Keep them only in migration docs or explicit v2 comparison content.
