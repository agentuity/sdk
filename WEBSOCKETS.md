# WebSocket Support in Vite Dev Mode - Solution

## Goal

Support WebSocket routes (particularly workbench WebSocket at `/_agentuity/workbench/ws`) in dev mode using Vite dev server with HMR.

## ✅ SOLVED - Final Architecture

**Single Bun Server with Vite Asset Server**

The solution was to abandon the dual Node.js + Vite architecture and instead use Bun's native WebSocket support with Vite running purely as an asset transformation server.

## The Fundamental Problem

**Vite dev server uses Node.js HTTP server, which doesn't natively support WebSocket upgrades when using `@hono/vite-dev-server`.**

The `@hono/vite-dev-server` plugin only handles HTTP requests via Vite's middleware system. WebSocket upgrade requests are a different protocol mechanism that Vite doesn't automatically handle.

## Architecture Overview

### Production (Works Fine)
- Bun.serve() with native WebSocket support
- Hono router with `router.websocket()` routes
- `upgradeWebSocket` from `hono/bun` handles the upgrade protocol

### Development (Current Issue)
- Vite dev server (Node.js HTTP server) on port 3500
- Secondary Node.js HTTP server on port 3501 for WebSocket handling
- Vite proxy forwards WebSocket upgrades to port 3501
- Hono app with WebSocket routes using `@hono/node-ws`

## What We've Implemented

### 1. Dual Server Architecture

**Port 3500 (Vite):**
- Handles HTTP requests via `@hono/vite-dev-server`
- Proxies WebSocket upgrades to port 3501

**Port 3501 (Node.js HTTP Server):**
- Created in `vite-dev-server.ts`
- Hono app attached via `@hono/node-server`
- WebSocket support via `@hono/node-ws`

### 2. Vite Proxy Configuration

```typescript
proxy: {
  '/_agentuity': {
    target: 'http://127.0.0.1:3501',
    ws: true,
    changeOrigin: false,
  },
  '/api': {
    target: 'http://127.0.0.1:3501',
    ws: true,
    changeOrigin: false,
  },
}
```

### 3. Server Startup Sequence

1. Generate entry file (`app.generated.ts`)
2. Create HTTP server on port 3501
3. Store server reference globally (`__AGENTUITY_WS_HTTP_SERVER__`)
4. Load generated app (attaches request handler + WebSocket support)
5. Create Vite server
6. Start Vite server (begins proxying)

### 4. WebSocket Integration

**In `entry-generator.ts` (dev mode):**
```typescript
if (globalThis.__AGENTUITY_WS_HTTP_SERVER__ && !globalThis.__AGENTUITY_WS_ATTACHED__) {
  const nodeServer = await import('@hono/node-server');
  const nodeWs = await import('@hono/node-ws');
  
  const httpServer = globalThis.__AGENTUITY_WS_HTTP_SERVER__;
  const requestListener = nodeServer.getRequestListener(app.fetch);
  const { injectWebSocket } = nodeWs.createNodeWebSocket({ app });
  
  httpServer.on('request', requestListener);
  injectWebSocket(httpServer);
  
  globalThis.__AGENTUITY_WS_ATTACHED__ = true;
}
```

**In `router.ts`:**
```typescript
// Set upgradeWebSocket globally from @hono/node-ws in dev mode
const nodeWs = (await import('@hono/node-ws')).createNodeWebSocket({ app: undefined });
globalThis.__AGENTUITY_UPGRADE_WEBSOCKET__ = nodeWs.upgradeWebSocket;

// Later used in router.websocket() implementation
const upgradeWebSocketFn = globalThis.__AGENTUITY_UPGRADE_WEBSOCKET__;
const wrapper = upgradeWebSocketFn((c) => { /* ... */ });
```

## What We Observe

### Logs Show:

1. ✅ WebSocket server starts successfully on port 3501
2. ✅ App loads and attaches to the server
3. ✅ Vite proxy detects WebSocket upgrade requests: `[Proxy] WebSocket upgrade - proxying /_agentuity/workbench/ws to :3501`
4. ❌ **But then:** `[Proxy] WebSocket error: The socket connection was closed unexpectedly`
5. ❌ **Missing:** `[HTTP Server] Upgrade request received` (our custom upgrade listener never fires)

### What This Tells Us:

- Vite's proxy is working correctly - it sees the upgrade and forwards it
- The request is being sent to port 3501
- **The HTTP server on port 3501 is NOT handling the upgrade request properly**
- Our custom upgrade event listener we added for debugging isn't firing at all

## What We've Tried

### Attempt 1: Global Bypass Function
- Used Vite proxy `bypass()` to detect WebSocket upgrades
- Problem: Too complex, needed to filter out Vite HMR WebSocket

### Attempt 2: Path-Based Proxying (Current)
- Explicit proxy configs for `/_agentuity` and `/api`
- Works better but upgrade still fails

### Attempt 3: Pre-loading App
- Load app before Vite starts to ensure handlers attached
- Prevents timing issues but doesn't fix upgrade

### Attempt 4: HMR Protection
- Added `__AGENTUITY_WS_ATTACHED__` guard to prevent re-attachment
- Prevents duplicate handlers but doesn't fix the core issue

### Attempt 5: Debug Logging
- Added upgrade event listener for debugging
- Never fires, confirming upgrade doesn't reach our server

## Current Hypotheses

### Hypothesis 1: `injectWebSocket()` Doesn't Work As Expected
`injectWebSocket()` from `@hono/node-ws` might not properly attach upgrade handlers to an externally-created HTTP server.

**Test:** Check `@hono/node-ws` source code to see what `injectWebSocket()` actually does.

### Hypothesis 2: Request Handler Conflicts
The `httpServer.on('request', requestListener)` might interfere with upgrade handling.

**Test:** Try NOT attaching request handler, only inject WebSocket.

### Hypothesis 3: Vite Proxy Doesn't Forward Properly
The proxy might be forwarding incorrectly despite logs saying it works.

**Test:** Use `tcpdump` or raw socket inspection to verify data reaches port 3501.

### Hypothesis 4: We Need Different Architecture
Maybe we shouldn't use `@hono/vite-dev-server` at all for WebSocket routes.

**Alternative:** Use `@hono/node-server` completely separately, don't integrate with Vite's middleware.

## Key Questions

1. **What does `injectWebSocket(httpServer)` actually do?**
   - Does it add an 'upgrade' event listener?
   - Does it modify the server in some way?
   - Does it work with externally-created servers?

2. **Why isn't our upgrade event listener firing?**
   - Is the request even reaching the server?
   - Is something intercepting it before our handler?

3. **Should we use a completely different approach?**
   - Run two completely independent servers?
   - Use `@hono/node-server` standalone without Vite integration?
   - Use a different WebSocket library entirely?

4. **Does `@hono/node-ws` even support this use case?**
   - Was it designed for servers created by `@hono/node-server.serve()`?
   - Can it work with externally-created HTTP servers?

## Next Steps to Investigate

1. **Read `@hono/node-ws` source code** - Understand what `injectWebSocket()` and `createNodeWebSocket()` actually do

2. **Verify network traffic** - Use `tcpdump` or Wireshark to confirm upgrade request arrives at port 3501

3. **Try minimal reproduction** - Create a standalone test without Vite to verify `@hono/node-ws` works as expected

4. **Consider alternative approaches:**
   - Use `ws` library directly instead of `@hono/node-ws`
   - Run WebSocket server completely separately from Vite
   - Use different port for WebSocket only (e.g., 3502)

---

## Final Working Solution

### Architecture

```
Browser:3500 → Bun Server (Bun.serve)
                 ├─ /api/* → Hono routes
                 ├─ /_agentuity/* → Workbench + WebSocket (native Bun)
                 ├─ /@vite/* → Proxy to Vite Asset Server
                 ├─ /src/web/* → Proxy to Vite Asset Server (HMR)
                 └─ WebSocket upgrades → hono/bun (native)

Vite:<dynamic> → Asset Server ONLY
                 └─ Transforms frontend files with HMR
                 └─ Port chosen automatically
```

### What Changed

1. **Removed Node.js dependencies:**
   - Deleted `@hono/node-server`
   - Deleted `@hono/node-ws`

2. **Bun server runs ALL logic:**
   - HTTP routes (API, workbench, web)
   - WebSocket connections (native `hono/bun`)
   - Asset proxy routes to Vite

3. **Vite is asset-only:**
   - Runs on dynamically-chosen port
   - No app logic, no routing
   - Only transforms TypeScript/JSX and provides HMR

4. **Single WebSocket code path:**
   - Dev mode uses `hono/bun` (same as production)
   - No conditional Node.js vs Bun logic
   - Works exactly like production

### Key Files

- `packages/cli/src/cmd/build/vite/bun-dev-server.ts` - Starts Bun server + Vite asset server
- `packages/cli/src/cmd/build/vite/vite-asset-server.ts` - Minimal Vite config for assets only
- `packages/cli/src/cmd/build/entry-generator.ts` - Generates asset proxy routes

### Benefits

✅ WebSocket works natively (no proxy issues)  
✅ Dev mode architecture matches production  
✅ No port conflicts (Vite chooses available port)  
✅ Simpler code (no Node.js conditionals)  
✅ Single server from browser perspective  
✅ HMR still works perfectly  

---

## Investigation History (Archived)

The sections below document the failed attempts and investigation process that led to the final solution.

## References

- Vite WebSocket proxy issue: https://github.com/honojs/vite-plugins/issues/253
- `@hono/node-ws` package: https://github.com/honojs/node-ws (no longer used)
- `@hono/node-server` package: https://github.com/honojs/node-server (no longer used)
- Hono WebSocket helpers: https://hono.dev/helpers/websocket
