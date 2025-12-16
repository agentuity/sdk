# Vite Dev Mode Architecture Refactor - Technical Plan

## Problem Statement

Current dual-server architecture (Node.js on 3501 + Vite on 3500) has fundamental WebSocket upgrade issues:
- `@hono/node-ws` + `@hono/vite-dev-server` don't work together for WebSocket upgrades
- Complex proxy configuration between two servers
- Upgrade events never reach Node.js HTTP server on port 3501
- Architecture differs significantly from production (Bun.serve)

## New Architecture Goal

**Single Bun Server with Vite Middleware for HMR**

- Port 3500: Bun server handles ALL requests (HTTP + WebSocket)
- Port 3501: Vite dev server runs ONLY for asset transformation and HMR
- Bun server proxies frontend assets to Vite dev server
- Native Bun WebSocket support works same as production
- Vite provides HMR for frontend code only

## Architecture Comparison

### Current (Broken)
```
Browser → Vite:3500 (@hono/vite-dev-server)
           ├─ HTTP requests → middleware → Hono app
           └─ WS upgrades → proxy → Node.js:3501 (FAILS)
                                      └─ @hono/node-ws (upgrade never fires)
```

### New (Proposed)
```
Browser → Bun:3500 (Hono app + Bun.serve)
           ├─ /api/* → Hono routes
           ├─ /_agentuity/* → Workbench routes + WebSocket
           ├─ /assets/* → Proxy to Vite:<dynamic-port>
           ├─ /*.tsx, /*.ts → Proxy to Vite:<dynamic-port> (HMR)
           └─ WebSocket upgrades → Native Bun WebSocket handler

Vite:<dynamic-port> (Asset Server)
           └─ Transforms/serves frontend files with HMR
           └─ Port chosen automatically by Vite
```

## Implementation Plan

### Phase 1: Setup Vite as Asset Server (Port 3501)

**Goal:** Run Vite dev server purely for asset transformation, not app routing

#### 1.1 Create New Vite Config Generator for Asset Mode
- [ ] Create `vite-asset-server-config.ts`
- [ ] Config should:
  - Disable all plugins except React and HMR
  - Set `server.middlewareMode: false` (standalone server)
  - Set `server.strictPort: false` (allow dynamic port selection)
  - Configure CORS to allow requests from port 3500
  - Only serve `src/web/**` files
  - Set `base: '/'` for asset paths
- [ ] Remove `@hono/vite-dev-server` plugin
- [ ] Remove `@hono/vite-build/bun` plugin
- [ ] Keep only: `react`, `browserEnvPlugin`, HMR client script injection

#### 1.2 Create Vite Asset Server Starter
- [ ] Create `vite-asset-server.ts`
- [ ] Function: `startViteAssetServer(rootDir, logger)`
- [ ] Returns: `{ server: ViteDevServer, port: number }`
- [ ] Port selection:
  - Let Vite choose available port automatically
  - Extract actual port from `server.config.server.port` after `.listen()`
  - Return both server and port number
- [ ] Should NOT load app.generated.ts
- [ ] Should NOT handle API routes

**Files to create:**
- `packages/cli/src/cmd/build/vite/vite-asset-server-config.ts` (new)
- `packages/cli/src/cmd/build/vite/vite-asset-server.ts` (new)

---

### Phase 2: Refactor Bun Dev Server (Port 3500)

**Goal:** Create Bun server that handles app logic and proxies frontend assets to Vite

#### 2.1 Create Bun Dev Server Starter
- [ ] Rename `vite-dev-server.ts` to `bun-dev-server.ts`
- [ ] Remove all Node.js HTTP server creation code
- [ ] Remove `@hono/node-server` imports
- [ ] Remove `@hono/node-ws` imports
- [ ] Remove proxy configuration logic
- [ ] Start Vite asset server FIRST and capture dynamic port
- [ ] Pass Vite port to entry generator
- [ ] Then start Bun server on port 3500

#### 2.2 Implement Asset Proxying in Bun Server
- [ ] Add `vitePort` parameter to `generateEntryFile()` options
- [ ] In `entry-generator.ts`, generate dev mode routes dynamically:
  - `app.get('/src/web/*', proxyToVite)` - Source files for HMR
  - `app.get('/@vite/*', proxyToVite)` - Vite client/HMR scripts
  - `app.get('/@react-refresh', proxyToVite)` - React refresh runtime
  - `app.get('/@fs/*', proxyToVite)` - File system access
  - `app.get('/@id/*', proxyToVite)` - Module resolution
- [ ] Generate `proxyToVite` handler with dynamic Vite port:
  ```typescript
  const VITE_PORT = ${vitePort};
  const proxyToVite = async (c: Context) => {
    const viteUrl = \`http://127.0.0.1:\${VITE_PORT}\${c.req.path}\`;
    const res = await fetch(viteUrl);
    // Forward response with correct headers
    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
  };
  ```

#### 2.3 Update Dev HTML Injection
- [ ] In `entry-generator.ts` dev web routes:
  - Read `src/web/index.html`
  - Transform script/link paths to use proxy routes (no need to expose Vite port):
    - `src="./main.tsx"` → `src="/src/web/main.tsx"`
    - Bun server proxies to Vite automatically
  - Inject Vite HMR client script (using proxy):
    ```html
    <script type="module" src="/@vite/client"></script>
    ```
  - Inject React Refresh (using proxy):
    ```html
    <script type="module">
      import RefreshRuntime from '/@react-refresh'
      RefreshRuntime.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => (type) => type
    </script>
    ```
  - **Note:** Browser never sees Vite port - all requests go through Bun:3500

#### 2.4 Restore Native Bun WebSocket Support
- [ ] In `entry-generator.ts` dev mode:
  - Remove Node.js HTTP server attachment code
  - Remove `globalThis.__AGENTUITY_WS_HTTP_SERVER__`
  - Remove `globalThis.__AGENTUITY_WS_ATTACHED__`
  - Use standard Bun.serve() startup:
    ```typescript
    Bun.serve({
      fetch: app.fetch,
      websocket,  // From hono/bun
      port: 3500,
      hostname: '127.0.0.1',
    });
    ```
- [ ] In `router.ts`:
  - Remove `globalThis.__AGENTUITY_UPGRADE_WEBSOCKET__` logic
  - Always use `hono/bun` in dev mode (same as production)
  - Simplify to single code path:
    ```typescript
    const { upgradeWebSocket } = await import('hono/bun');
    globalThis.__AGENTUITY_UPGRADE_WEBSOCKET__ = upgradeWebSocket;
    ```

**Files to modify:**
- `packages/cli/src/cmd/build/vite/vite-dev-server.ts` → rename to `bun-dev-server.ts`
- `packages/cli/src/cmd/build/entry-generator.ts` (major changes)
- `packages/runtime/src/router.ts` (simplification)

---

### Phase 3: Clean Up Dependencies

#### 3.1 Remove Node.js-specific Dependencies
- [ ] Remove from `packages/cli/package.json`:
  - `@hono/node-server`
  - `@hono/node-ws`
- [ ] Remove from `packages/runtime/package.json`:
  - `@hono/node-server` (if present)
  - `@hono/node-ws` (if present)

#### 3.2 Update Imports
- [ ] Search for all `@hono/node-server` imports and remove
- [ ] Search for all `@hono/node-ws` imports and remove
- [ ] Ensure all WebSocket code uses `hono/bun`

**Files to check:**
- `packages/cli/src/cmd/build/vite/**/*.ts`
- `packages/runtime/src/**/*.ts`

---

### Phase 4: Update Vite Config Generation

#### 4.1 Simplify Main Vite Config
- [ ] In `vite-config-generator.ts`:
  - Remove proxy configuration entirely
  - Remove `@hono/vite-dev-server` plugin in dev mode
  - Config should be MINIMAL (just for asset serving)
  - Or potentially remove this file entirely if using new asset-server-config

#### 4.2 Update Dev Command
- [ ] In `packages/cli/src/cmd/dev/index.ts`:
  - Call `startViteAssetServer(rootDir, logger)` first
  - Capture returned `{ server: viteServer, port: vitePort }`
  - Pass `vitePort` to `startBunDevServer(options + vitePort)`
  - Update logging to show both ports:
    - "Vite asset server started on port {vitePort}"
    - "Bun dev server started on port 3500"
  - Store both server references for cleanup

**Files to modify:**
- `packages/cli/src/cmd/build/vite/vite-config-generator.ts`
- `packages/cli/src/cmd/dev/index.ts`

---

### Phase 5: Testing & Validation

#### 5.1 Test WebSocket Functionality
- [ ] Start dev server with workbench enabled
- [ ] Open workbench in browser
- [ ] Verify WebSocket connection succeeds
- [ ] Check browser console for:
  - No WebSocket connection errors
  - "alive" message received
  - Real-time updates work (e.g., file changes trigger rebuild notifications)

#### 5.2 Test HMR Functionality
- [ ] Make changes to `src/web/frontend.tsx`
- [ ] Verify HMR updates browser without full reload
- [ ] Check React Fast Refresh works
- [ ] Verify no console errors about missing modules

#### 5.3 Test API Routes
- [ ] Make requests to `/api/*` routes
- [ ] Verify they work same as before
- [ ] Check no interference with Vite asset requests

#### 5.4 Test Workbench Routes
- [ ] Access `/_agentuity/workbench/metadata`
- [ ] Access `/_agentuity/workbench/execute`
- [ ] Verify authentication works
- [ ] Check agent execution returns correct results

#### 5.5 Test Production Build
- [ ] Run `bun run build`
- [ ] Verify production mode still works (unchanged)
- [ ] Check WebSocket works in production
- [ ] Verify static assets served correctly

---

### Phase 6: Documentation Updates

#### 6.1 Update Architecture Docs
- [ ] Update `WEBSOCKETS.md` with new architecture
- [ ] Add section "Final Architecture (Working)" with diagrams
- [ ] Document how Vite asset server works
- [ ] Document proxy routes in Bun server

#### 6.2 Update Developer Guides
- [ ] Update `packages/cli/AGENTS.md` with new dev server details
- [ ] Update `AGENTS.md` in root with dev mode explanation
- [ ] Add troubleshooting section for common issues

#### 6.3 Clean Up Investigation Notes
- [ ] Archive old WEBSOCKETS.md investigation as reference
- [ ] Create WEBSOCKETS-SOLUTION.md with final working approach

---

## Risk Assessment

### Low Risk
- ✅ Bun WebSocket support is proven (works in production)
- ✅ Vite as asset server is standard pattern
- ✅ No changes to production build

### Medium Risk
- ⚠️ HMR might need tuning for proxy setup
- ⚠️ CORS configuration between ports 3500/3501
- ⚠️ Asset path resolution might need adjustment

### High Risk
- ❌ None identified - architecture is sound

---

## Rollback Plan

If refactor fails:
1. Revert to previous commit before refactor started
2. Re-examine `@hono/node-ws` source code
3. Consider alternative: separate WebSocket-only server on port 3502

---

## Success Criteria

- [x] WebSocket connection works in dev mode (same as production)
- [x] HMR works for frontend code
- [x] All API routes functional
- [x] Workbench fully functional with WebSocket
- [x] No duplicate servers or complex proxy configs
- [x] Dev mode architecture similar to production
- [x] Clean dependency tree (no Node.js-specific packages in runtime)

---

## Implementation Checklist

### Phase 1: Vite Asset Server ⏳
- [ ] Create `vite-asset-server-config.ts`
- [ ] Create `vite-asset-server.ts`
- [ ] Test Vite runs on port 3501 independently

### Phase 2: Bun Dev Server ⏳
- [ ] Rename and refactor `bun-dev-server.ts`
- [ ] Add asset proxy routes
- [ ] Update HTML injection
- [ ] Restore Bun WebSocket support
- [ ] Test Bun server runs on port 3500

### Phase 3: Dependencies ⏳
- [ ] Remove `@hono/node-server`
- [ ] Remove `@hono/node-ws`
- [ ] Run `bun install`

### Phase 4: Config Updates ⏳
- [ ] Simplify/remove old Vite config generator
- [ ] Update dev command
- [ ] Test full startup sequence

### Phase 5: Testing ⏳
- [ ] WebSocket tests
- [ ] HMR tests
- [ ] API route tests
- [ ] Workbench tests
- [ ] Production build test

### Phase 6: Documentation ⏳
- [ ] Update WEBSOCKETS.md
- [ ] Update AGENTS.md files
- [ ] Create solution documentation

---

## Timeline Estimate

- Phase 1: 30-45 minutes (new Vite asset server)
- Phase 2: 60-90 minutes (Bun server refactor)
- Phase 3: 15 minutes (dependency cleanup)
- Phase 4: 30 minutes (config updates)
- Phase 5: 45-60 minutes (thorough testing)
- Phase 6: 30 minutes (documentation)

**Total: 3.5-5 hours**

---

## Notes

- Keep production build unchanged (already working)
- Maintain backward compatibility for user projects
- Consider adding `--dev-port` flag for custom Bun server port
- Vite asset server port is always dynamic (no configuration needed)
- Document that dev mode now requires Bun runtime (not Node.js)
- Browser only connects to Bun:3500, never directly to Vite port
