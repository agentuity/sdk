---
name: agentuity-routing
description: Building API routes, middleware, and real-time handlers with Agentuity Runtime. Use when creating Hono-based API routes with createRouter, adding middleware, setting up WebSocket or SSE endpoints, handling cron jobs, configuring CORS, using agent.validator() for route validation, or building WebRTC signaling. Triggers on any Agentuity routing, middleware, or real-time communication task.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Routing

Build API routes, middleware, and real-time handlers with `@agentuity/runtime`. The routing layer is built on [Hono](https://hono.dev) and lives alongside your agents.

## API Routes

Routes live in `src/api/` and use `createRouter`:

```typescript
// src/api/index.ts
import { createRouter } from '@agentuity/runtime';

const api = createRouter();

api.get('/health', (c) => c.json({ status: 'ok' }));

api.post('/users', async (c) => {
  const body = await c.req.json();
  return c.json({ user: body }, 201);
});

api.get('/users/:id', (c) => {
  const id = c.req.param('id');
  return c.json({ id });
});

export default api;
```

Routes are mounted automatically — `src/api/index.ts` exports become available at `/api/*`.

## Agent Route Validation

Use `agent.validator()` to get automatic input validation from the agent's schema:

```typescript
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/my-agent';

const api = createRouter();

// Validates request body against the agent's input schema
api.post('/run', myAgent.validator(), async (c) => {
  const data = c.req.valid('json');  // Fully typed from agent schema
  const result = await myAgent.run(data);
  return c.json(result);
});

export default api;
```

This reuses the agent's schema definition — no duplicate validation code.

## Middleware

Add middleware to routes using `.use()`:

```typescript
const api = createRouter();

// Apply to all routes under /api/*
api.use('/api/*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  c.header('X-Response-Time', `${ms}ms`);
});

// Auth middleware for specific routes
api.use('/api/protected/*', async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});
```

### Built-in Middleware

The runtime provides middleware factories:

```typescript
import {
  createBaseMiddleware,
  createCorsMiddleware,
  createOtelMiddleware,
  createCompressionMiddleware,
  createWebSessionMiddleware,
} from '@agentuity/runtime';
```

These are typically configured through `createApp` rather than applied manually.

## CORS

Configure CORS in `createApp`:

```typescript
import { createApp } from '@agentuity/runtime';

await createApp({
  cors: {
    origin: ['https://myapp.com', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});
```

For dynamic origin checking use `createTrustedCorsOrigin`:

```typescript
import { createTrustedCorsOrigin } from '@agentuity/runtime';

await createApp({
  cors: {
    origin: createTrustedCorsOrigin({
      allowedOrigins: ['https://myapp.com'],
      allowLocalhost: true,  // Allow localhost in dev
    }),
  },
});
```

## WebSocket Handlers

Define WebSocket endpoints using the `websocket` handler:

```typescript
import { websocket } from '@agentuity/runtime';

// In your route setup
const ws = websocket({
  open(ws) {
    console.log('Client connected');
  },
  message(ws, message) {
    // Echo back
    ws.send(JSON.stringify({ echo: message }));
  },
  close(ws) {
    console.log('Client disconnected');
  },
});
```

WebSocket agents work alongside regular HTTP agents — define the WebSocket handler and mount it on a route.

## Server-Sent Events (SSE)

Stream events to clients with the `sse` handler:

```typescript
import { sse, type SSEStream } from '@agentuity/runtime';

const handler = sse(async (stream: SSEStream, c) => {
  // Send events over time
  await stream.writeSSE({
    event: 'update',
    data: JSON.stringify({ progress: 25 }),
  });

  await stream.writeSSE({
    event: 'update',
    data: JSON.stringify({ progress: 100 }),
  });

  // Stream closes when the function returns
});
```

## Cron Handlers

Schedule recurring tasks:

```typescript
import { cron } from '@agentuity/runtime';

const cleanup = cron({
  schedule: '0 */6 * * *',  // Every 6 hours
  handler: async (ctx) => {
    ctx.logger.info('Running cleanup');
    // Perform scheduled work
  },
});
```

## WebRTC Signaling

Set up WebRTC peer connections with built-in signaling:

```typescript
import { webrtc, WebRTCRoomManager } from '@agentuity/runtime';

const rooms = new WebRTCRoomManager();

const handler = webrtc({
  roomManager: rooms,
  onJoin: (roomId, peerId) => {
    console.log(`${peerId} joined ${roomId}`);
  },
  onLeave: (roomId, peerId) => {
    console.log(`${peerId} left ${roomId}`);
  },
});
```

## Stream Handler

For custom streaming responses:

```typescript
import { stream } from '@agentuity/runtime';

const handler = stream(async (writable, c) => {
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  for (let i = 0; i < 10; i++) {
    await writer.write(encoder.encode(`chunk ${i}\n`));
    await Bun.sleep(100);
  }

  await writer.close();
});
```

## Route Methods

The router supports all standard HTTP methods:

```typescript
const api = createRouter();

api.get('/items', handler);
api.post('/items', handler);
api.put('/items/:id', handler);
api.patch('/items/:id', handler);
api.delete('/items/:id', handler);

// Handle multiple methods
api.on(['GET', 'POST'], '/multi', handler);
```

## Request and Response

Hono's context (`c`) provides request/response utilities:

```typescript
api.post('/example', async (c) => {
  // Request
  const body = await c.req.json();
  const query = c.req.query('search');
  const param = c.req.param('id');
  const header = c.req.header('Authorization');

  // Response
  return c.json({ data: 'value' });          // JSON
  return c.text('Hello');                     // Plain text
  return c.html('<h1>Hello</h1>');            // HTML
  return c.redirect('/other');                // Redirect
  return c.json({ error: 'Not found' }, 404); // Status code
});

// Set response headers
api.get('/headers', (c) => {
  c.header('X-Custom', 'value');
  c.header('Cache-Control', 'max-age=3600');
  return c.json({ ok: true });
});
```

## Project Structure

A full-stack Agentuity project:

```
src/
├── agent/           # Agent handlers
│   ├── chat/
│   │   └── index.ts
│   └── translate/
│       └── index.ts
├── api/             # API routes (Hono)
│   └── index.ts
└── web/             # React frontend (optional)
    └── App.tsx
app.ts               # createApp entry point
agentuity.config.ts  # Build configuration
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| Using Express/Fastify | Use `createRouter()` — it's Hono under the hood |
| Manual input validation in routes | Use `myAgent.validator()` to reuse agent schemas |
| Starting a separate HTTP server | `createApp` handles the server — just export routers |
| Using `npm` or `pnpm` | Always use `bun` for Agentuity projects |
