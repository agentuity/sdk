# Vite Migration Plan - @agentuity/sdk

## Overview

Migrate from Bun's bundler to Vite for both development and production builds while maintaining Bun + Hono runtime. This will provide HMR, better developer experience, and leverage the existing Vite ecosystem.

## Goals

- ✅ Replace Bun bundler with Vite for client-side builds
- ✅ Replace custom dev server with Vite dev server + HMR
- ✅ Maintain Bun + Hono for server runtime
- ✅ Reduce custom/bespoke code by using Vite ecosystem
- ✅ Keep existing DX: `agentuity dev`, `agentuity build`
- ✅ Preserve agent/route discovery and type generation

## Architecture Changes

### Current Architecture (Bun-based)

```
CLI Command (dev/build)
    ↓
Custom AgentuityPlugin (Bun.build plugin)
    ↓
├── Agent Discovery (AST parsing)
├── Route Discovery (AST parsing)
├── Code Generation (registry, types)
├── Runtime Code Injection (app.ts modification)
├── Workbench Bundling (separate Bun.build)
└── Web Bundling (Bun.build)
    ↓
Custom Dev Server (Bun.serve with watch)
    ↓
Output: dist/
```

### New Architecture (Vite-based)

```
CLI Command (dev/build)
    ↓
Config Generator
    ├── Template vite.config.ts (in-code)
    ├── User agentuity.config.ts
    └── Generated .vite/vite.config.ts (ephemeral)
    ↓
Vite Build Process
    ↓
├── Client Build (React/Frontend)
│   ├── @vitejs/plugin-react (HMR, JSX)
│   └── Output: dist/client/
│
├── Server Build (Bun + Hono)
│   ├── @hono/vite-build/bun (server bundling)
│   ├── @hono/vite-dev-server (dev mode)
│   ├── AgentuityVitePlugin (custom)
│   │   ├── Agent Discovery (virtual module)
│   │   ├── Route Discovery (virtual module)
│   │   ├── Code Generation (build hooks)
│   │   └── Manifest Generation (build hooks)
│   └── Output: dist/server/
│
└── Workbench Build (separate, if configured)
    ├── @vitejs/plugin-react
    └── Output: dist/workbench/
    ↓
Vite Dev Server
    ├── HMR for client code
    ├── Hono adapter for server routes
    ├── Dev sync service (lifecycle hooks)
    └── Workbench served via Hono
```

## Component Breakdown

### 1. Config System

**Location:** `packages/cli/src/config/vite-config-generator.ts` (new)

**Responsibilities:**

- Define base Vite config as TypeScript template
- Load user's `agentuity.config.ts`
- Merge configs with validation
- Write ephemeral `.agentuity/.vite/vite.config.ts`

**User Config Format (agentuity.config.ts):**

```typescript
import type { AgentuityConfig } from '@agentuity/cli';

export default {
  // Vite overrides (subset of ViteConfig)
  vite?: {
    plugins?: Plugin[];
    define?: Record<string, string>;
    resolve?: { alias?: Record<string, string> };
    // ... other safe vite options
  },

  // Agentuity-specific
  workbench?: {
    enabled: boolean;
    route?: string;
  }
} satisfies AgentuityConfig;
```

**Generated Config Structure:**

```typescript
// .agentuity/.vite/vite.config.ts (ephemeral, gitignored)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import adapter from '@hono/vite-dev-server/bun';
import build from '@hono/vite-build/bun';
import { agentuityPlugin } from '@agentuity/cli/vite-plugin';

export default defineConfig(({ mode }) => {
	if (mode === 'client') {
		return {
			// Client build config (for CDN upload)
			plugins: [react(), ...userPlugins],
			build: {
				outDir: '.agentuity/client',
				rollupOptions: {
					input: './src/web/main.tsx',
				},
				manifest: true,
				emptyOutDir: true,
			},
		};
	} else if (mode === 'workbench') {
		return {
			// Workbench build config (for CDN upload, conditional)
			plugins: [react()],
			build: {
				outDir: '.agentuity/workbench',
				rollupOptions: {
					input: './src/workbench/main.tsx',
				},
				manifest: true,
				emptyOutDir: true,
			},
		};
	} else {
		return {
			// Server build config
			plugins: [
				react(),
				devServer({ entry: 'app.ts', adapter }),
				build({
					entry: 'app.ts',
					output: {
						entryFileNames: 'app.js', // Output at .agentuity/app.js
					},
				}),
				agentuityPlugin({
					/* options */
				}),
				...userPlugins,
			],
			build: {
				outDir: '.agentuity',
				emptyOutDir: false, // Don't delete client/workbench folders
			},
		};
	}
});
```

### 2. Agentuity Vite Plugin

**Location:** `packages/cli/src/vite-plugin/index.ts` (new)

**Port from AgentuityPlugin (Bun) → AgentuityVitePlugin:**

| Current (Bun Plugin)                   | New (Vite Plugin)                  | Notes                                          |
| -------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| `build.onLoad()` for agents (mutation) | Read-only AST analysis             | **No source mutation** - just extract metadata |
| `build.onLoad()` for routes            | Read-only AST analysis             | **No source mutation** - just extract metadata |
| AST parsing (agents)                   | Keep same AST logic                | Move to plugin helper, **read-only mode**      |
| AST parsing (routes)                   | Keep same AST logic                | Move to plugin helper, **read-only mode**      |
| Code injection (app.ts)                | `transform` hook with magic-string | Transform app.ts imports only                  |
| Registry generation                    | `buildStart` hook                  | Write .agentuity/registry.generated.ts         |
| Lifecycle types                        | `buildStart` hook                  | Write .agentuity/lifecycle.generated.d.ts      |
| Metadata output                        | `writeBundle` hook                 | Write agentuity.metadata.json                  |
| Patches (ai-sdk, etc.)                 | `resolveId` + `load` hooks         | Port patch logic                               |

**Virtual Modules:**

```typescript
// Virtual modules exposed by the plugin
import { agentRegistry } from 'virtual:agentuity/agents';
import { routeRegistry } from 'virtual:agentuity/routes';
```

**Plugin Structure:**

```typescript
// packages/cli/src/vite-plugin/index.ts
import MagicString from 'magic-string';

export function agentuityPlugin(options: AgentuityPluginOptions): Plugin {
	return {
		name: 'agentuity',

		// Discovery phase - READ ONLY, NO SOURCE MUTATION
		async buildStart() {
			// Discover agents via read-only AST analysis
			const agents = await discoverAgents(srcDir);

			// Discover routes via read-only AST analysis
			const routes = await discoverRoutes(apiDir);

			// Generate registry from discovered metadata
			// Note: Original source files are NOT modified
			await generateRegistry(agents);
			await generateLifecycleTypes();
		},

		// Virtual module resolution
		resolveId(id) {
			if (id === 'virtual:agentuity/agents') return '\0virtual:agentuity/agents';
			if (id === 'virtual:agentuity/routes') return '\0virtual:agentuity/routes';
		},

		load(id) {
			if (id === '\0virtual:agentuity/agents') {
				return generateAgentRegistryCode();
			}
			if (id === '\0virtual:agentuity/routes') {
				return generateRouteRegistryCode();
			}
		},

		// Transform app.ts to inject initialization code
		// CRITICAL: Use magic-string to preserve source maps
		transform(code, id) {
			if (id.endsWith('app.ts')) {
				const s = new MagicString(code);
				const insertPos = findCreateAppEndPosition(code);

				// Inject route mounting and agent initialization
				s.appendRight(insertPos, '\n' + generateInitializationCode());

				return {
					code: s.toString(),
					map: s.generateMap({
						hires: true,
						source: id,
						includeContent: true,
					}),
				};
			}
		},

		// Output metadata
		async writeBundle() {
			await writeMetadata();
		},
	};
}
```

### 3. Build Command Refactor

**Location:** `packages/cli/src/cmd/build/index.ts`

**Changes:**

1. Remove `bundle()` function (replaced by Vite)
2. Add `generateViteConfig()` call
3. Execute Vite builds in sequence:
   - Client build: `vite build --mode client`
   - Server build: `vite build --mode server`
   - Workbench build (conditional): `vite build --mode workbench`
4. Generate Agentuity manifest from Vite manifests
5. Keep packaging logic (zip, metadata)

**New Flow:**

```typescript
async function buildCommand(ctx: CommandContext) {
	// 1. Generate vite config
	await generateViteConfig(rootDir, userConfig);

	// 2. Build client (for CDN)
	await exec('vite build --mode client');

	// 3. Build workbench (for CDN, if configured)
	if (workbenchConfig) {
		await exec('vite build --mode workbench');
	}

	// 4. Build server (single bundle at .agentuity/app.js)
	await exec('vite build --mode server');

	// 5. Generate Agentuity manifest with CDN URLs
	await generateAgentuityManifest({ cdnBaseUrl });

	// 6. Upload client/workbench assets to CDN
	await uploadAssetsToCDN();

	// 7. Package server bundle for deployment
	await packageForDeploy(); // Only packages .agentuity/app.js + manifest
}
```

### 4. Dev Command Refactor

**Location:** `packages/cli/src/cmd/dev/index.ts`

**Changes:**

1. Remove custom Bun.serve dev server
2. Generate vite config
3. Start **SINGLE** Vite dev server (Hono + client + server HMR)
4. Integrate dev sync service into Vite lifecycle

**New Flow (Single Unified Server):**

```typescript
async function devCommand(ctx: CommandContext) {
  // 1. Generate vite config for dev mode
  await generateViteConfig(rootDir, userConfig, { dev: true });

  // 2. Setup dev sync service
  const syncService = createDevmodeSyncService({ ... });

  // 3. Start SINGLE Vite dev server
  // Uses @hono/vite-dev-server to run Hono app with HMR for both client and server
  const proc = Bun.spawn(['bunx', '--bun', 'vite', '--config', '.agentuity/.vite/vite.config.ts'], {
    cwd: rootDir,
    env: {
      ...process.env,
      AGENTUITY_DEV_SYNC_SERVICE: 'true',
    },
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  // 4. Dev sync service runs as Vite middleware (configured in vite.config.ts)

  // 5. Display URLs (after Vite starts)
  logger.info(`Dev server running at http://localhost:${port}`);
  logger.info(`HMR enabled for both client and server code`);

  await proc.exited;
}
```

**Vite Config (Dev Mode):**

```typescript
// .agentuity/.vite/vite.config.ts (dev mode)
export default defineConfig({
  plugins: [
    react(),
    devServer({
      entry: 'app.ts',
      adapter, // Bun adapter
    }),
    agentuityPlugin({ dev: true }),
    // Dev sync service middleware
    {
      name: 'agentuity-dev-sync',
      configureServer(server) {
        const syncService = createDevmodeSyncService({ ... });

        server.middlewares.use(async (req, res, next) => {
          await syncService.handleRequest(req, res);
          next();
        });

        server.watcher.on('change', async (file) => {
          await syncService.notifyChange(file);
        });
      },
    },
  ],
  server: {
    port: 3500,
  },
});
```

**Key Benefits:**

- ✅ **One process** for both client and server
- ✅ **Full HMR** for React components AND server routes
- ✅ **Fast refresh** on code changes (no full reload)
- ✅ Same experience as prototype

### 5. Workbench Build

**Location:** `packages/cli/src/cmd/build/workbench-builder.ts` (new)

**Approach:**

- Separate Vite build mode (`--mode workbench`)
- Entry point: `src/workbench/main.tsx` (or configured path)
- Output: `dist/workbench/`
- Manifest: `dist/workbench/.vite/manifest.json`

**Integration:**

```typescript
// In app.ts (server), import at build time
if (import.meta.env.PROD) {
	import workbenchManifest from '../workbench/.vite/manifest.json';

	router.get('/workbench', (c) => {
		const entry = workbenchManifest['src/workbench/main.tsx'];
		return c.html(generateWorkbenchHtml(entry));
	});
}
```

### 6. Manifest System

**Location:** `packages/cli/src/manifest/`

**Responsibilities:**

- Read Vite manifests (client, server, workbench)
- Generate Agentuity manifest format
- Provide runtime helpers for asset resolution

**Agentuity Manifest Format (agentuity.metadata.json):**

Must maintain exact same schema as current implementation:

```json
{
	"routes": [
		{
			"id": "route-hash-123",
			"filename": "src/api/users.ts",
			"path": "/api/users",
			"method": "get",
			"version": "sha256-content-hash",
			"type": "api",
			"agentIds": ["agent-id-456"],
			"config": {},
			"schema": {
				"input": "{\"type\":\"object\",\"properties\":{...}}",
				"output": "{\"type\":\"object\",\"properties\":{...}}"
			}
		}
	],
	"agents": [
		{
			"id": "agent-id-456",
			"name": "user-agent",
			"description": "User management agent",
			"version": "sha256-content-hash",
			"filename": "src/agent/user/agent.ts",
			"stream": false,
			"schema": {
				"input": "{\"type\":\"object\",\"properties\":{...}}",
				"output": "{\"type\":\"object\",\"properties\":{...}}"
			}
		}
	],
	"assets": [
		{
			"filename": "client/assets/main-abc123.js",
			"url": "https://cdn.agentuity.com/proj-123/v1/client/assets/main-abc123.js",
			"kind": "javascript",
			"contentType": "application/javascript",
			"size": 123456
		},
		{
			"filename": "client/assets/main-abc123.css",
			"url": "https://cdn.agentuity.com/proj-123/v1/client/assets/main-abc123.css",
			"kind": "stylesheet",
			"contentType": "text/css",
			"size": 45678
		}
	],
	"project": {
		"id": "proj-123",
		"name": "my-agentuity-app",
		"version": "1.0.0",
		"description": "My application",
		"keywords": ["agentuity", "agent"],
		"orgId": "org-456"
	},
	"deployment": {
		"id": "deploy-789",
		"region": "us-east-1",
		"date": "2025-12-13T10:00:00Z",
		"git": {
			"repo": "my-org/my-repo",
			"commit": "abc123def456",
			"message": "feat: add new feature",
			"branch": "main",
			"tags": ["v1.0.0", "latest"],
			"provider": "github",
			"trigger": "push",
			"url": "https://github.com/my-org/my-repo/commit/abc123",
			"buildUrl": "https://github.com/my-org/my-repo/actions/runs/123",
			"event": "push"
		},
		"build": {
			"bun": "1.3.4",
			"agentuity": "0.1.0",
			"arch": "arm64",
			"platform": "darwin"
		}
	}
}
```

**Additional Output Files:**

**`.routemapping.json`** (for workbench route tracking):

```json
{
	"GET /api/users": "route-hash-123",
	"POST /api/users": "route-hash-456"
}
```

**Vite Manifests (coexist with agentuity.metadata.json):**

Vite generates its own manifest files that we keep:

- `.agentuity/client/.vite/manifest.json` - Vite's client manifest
- `.agentuity/workbench/.vite/manifest.json` - Vite's workbench manifest (if configured)

**Vite manifest example:**

```json
{
	"src/web/main.tsx": {
		"file": "assets/main-abc123.js",
		"src": "src/web/main.tsx",
		"isEntry": true,
		"css": ["assets/main-abc123.css"],
		"assets": ["assets/logo-xyz789.svg"]
	}
}
```

**Integration Process:**

During build, we:

1. Vite generates its manifests (client, workbench)
2. Read Vite manifests to extract asset info
3. Map Vite asset paths to CDN URLs
4. Populate `assets` array in `agentuity.metadata.json`
5. Both manifests coexist in `.agentuity/`

**Asset Schema:**

- `filename` - Relative path from project root (e.g., `"client/assets/main-abc123.js"`)
- `url` - Full CDN URL (e.g., `"https://cdn.agentuity.com/proj-123/v1/client/assets/main-abc123.js"`)
- `kind` - Asset type (e.g., `"javascript"`, `"stylesheet"`, `"image"`)
- `contentType` - MIME type
- `size` - Size in bytes

**File coexistence:**

```
.agentuity/
├── .vite/                              # Ephemeral (gitignored, excluded from zip)
│   └── vite.config.ts
├── app.js                              # Server bundle (deploy)
├── agentuity.metadata.json             # Our manifest (deploy)
├── .routemapping.json                  # Route mapping (deploy)
├── client/
│   └── .vite/
│       └── manifest.json               # Vite's client manifest (kept)
└── workbench/
    └── .vite/
        └── manifest.json               # Vite's workbench manifest (kept)
```

**Note:** Schema must remain compatible with `BuildMetadataSchema` in `@agentuity/server`

### 7. Runtime Changes

**Location:** `packages/runtime/src/`

**Changes:**

1. Update manifest loading to support new format
2. Add Vite manifest helpers
3. Update `serveStatic` paths to match Vite output structure

**Example:**

```typescript
// packages/runtime/src/manifest.ts
export function loadManifest() {
	if (import.meta.env.DEV) {
		// Dev mode: Vite serves assets
		return null;
	}

	// Prod mode: Load Agentuity manifest
	const manifest = require('../dist/manifest.json');
	return manifest;
}

export function getAssetUrl(path: string): string {
	const manifest = loadManifest();
	if (!manifest) {
		// Dev mode: Vite handles it
		return path;
	}

	// Prod mode: Use manifest mapping
	return manifest.client.assets[path] || path;
}
```

## Migration Phases

### Phase 1: Foundation (Week 1)

**Goal:** Set up Vite infrastructure without breaking existing functionality

- [ ] Add Vite dependencies to package.json
- [ ] Create config generator (`vite-config-generator.ts`)
- [ ] Create basic Vite plugin structure (`vite-plugin/index.ts`)
- [ ] Update .gitignore to exclude `.agentuity/.vite/`
- [ ] Create prototype Vite builds (client, server, workbench)
- [ ] Update TypeScript paths/references

**Validation:**

- Vite can build a simple client app
- Vite can build a simple Hono server
- Config generator produces valid vite.config.ts

### Phase 2: Agent & Route Discovery (Week 2)

**Goal:** Port AST analysis and code generation to Vite plugin

- [ ] Add `magic-string` dependency for source map preservation
- [ ] **Refactor agent discovery to be read-only (no source mutation)**
- [ ] **Refactor eval discovery to be read-only (no source mutation)**
- [ ] Port agent discovery to Vite plugin `buildStart` hook (read-only)
- [ ] Port route discovery to Vite plugin `buildStart` hook (read-only)
- [ ] Implement virtual modules (`virtual:agentuity/agents`, `virtual:agentuity/routes`)
- [ ] Port registry generation logic
- [ ] Port lifecycle type generation
- [ ] Refactor app.ts injection to use `magic-string` (only file that gets transformed)
- [ ] Update tests for new discovery mechanism
- [ ] Verify source maps work correctly in dev mode and production
- [ ] Benchmark build time improvement from read-only AST analysis

**Validation:**

- Agent files are NOT mutated during build
- Eval files are NOT mutated during build
- Agent discovery produces same .agentuity/registry.generated.ts
- Route discovery produces same metadata
- Virtual modules resolve correctly
- Build is faster than current Bun bundler

### Phase 3: Build Command Integration (Week 3)

**Goal:** Replace Bun bundler with Vite in build command

- [ ] Refactor `packages/cli/src/cmd/build/index.ts`
- [ ] Implement client build step
- [ ] Implement server build step
- [ ] Implement workbench build step (conditional)
- [ ] Port manifest generation
- [ ] Update packaging logic for new dist/ structure
- [ ] Update build tests

**Validation:**

- `agentuity build` produces valid `.agentuity/app.js`, `.agentuity/client/`, `.agentuity/workbench/`
- Server bundle at `.agentuity/app.js` (root level)
- Client/workbench assets ready for CDN upload
- Manifest contains CDN URLs
- Deployment package contains only `app.js` + `manifest.json`

### Phase 4: Dev Command Integration (Week 4)

**Goal:** Replace custom dev server with Vite dev server

- [ ] Refactor `packages/cli/src/cmd/dev/index.ts`
- [ ] Integrate Vite dev server
- [ ] Port dev sync service to Vite middleware
- [ ] Implement HMR for client code
- [ ] Port workbench dev serving
- [ ] Update watch logic to use Vite's watcher
- [ ] Update dev tests

**Validation:**

- `agentuity dev` starts Vite dev server
- HMR works for React components
- Server routes accessible
- Dev sync service functions
- Workbench accessible in dev mode

### Phase 5: Runtime & Manifest (Week 5)

**Goal:** Update runtime to work with Vite output

- [ ] Update `packages/runtime/src/` for new manifest format
- [ ] Implement asset URL resolution helpers
- [ ] Update HTML generation for Vite assets
- [ ] Update static serving paths
- [ ] Port React Refresh integration
- [ ] Update runtime tests

**Validation:**

- Production builds serve assets correctly
- Dev mode HTML generation works
- Workbench loads in production
- All runtime features functional

### Phase 6: Polish & Migration (Week 6)

**Goal:** Clean up deprecated code and finalize migration

- [ ] Remove old Bun bundler code (`bundler.ts`, `plugin.ts`)
- [ ] Remove old dev server code
- [ ] Update all tests to use Vite
- [ ] Update documentation
- [ ] Add migration guide for existing projects
- [ ] Performance benchmarking (build time, dev server startup)

**Validation:**

- All tests passing
- No references to old bundler code
- Documentation complete
- Migration guide tested

## Testing Strategy

### Unit Tests

**Location:** `packages/cli/test/vite/`

- [ ] Config generator tests
- [ ] Vite plugin hooks tests
- [ ] Agent discovery tests (ported from existing)
- [ ] Route discovery tests (ported from existing)
- [ ] Virtual module tests
- [ ] Manifest generation tests

### Integration Tests

**Location:** `packages/cli/test/build/vite-integration.test.ts`

- [ ] Full build cycle (client + server + workbench)
- [ ] Dev server startup and HMR
- [ ] Agent registry generation in Vite context
- [ ] Route mounting with Vite
- [ ] Production manifest loading

### End-to-End Tests

**Location:** `packages/cli/test/e2e/`

- [ ] Build existing test apps with Vite
- [ ] Dev mode for existing test apps
- [ ] Deploy workflow with Vite output
- [ ] Workbench integration test

## Breaking Changes

### For Users

**None expected** - CLI commands remain the same:

- `agentuity dev` - works as before, now with HMR
- `agentuity build` - works as before, now with Vite

**Possible Changes:**

- `dist/` structure changes (dist/client/, dist/server/)
- May need to update custom Bun.build configs to Vite configs
- Different asset paths in production (handled by manifest)

### For SDK Internals

- Remove `packages/cli/src/cmd/build/bundler.ts`
- Remove `packages/cli/src/cmd/build/plugin.ts`
- Update `packages/runtime` manifest loading
- New config format for `agentuity.config.ts`

## Rollback Plan

### Incremental Rollback

Each phase is independent and can be rolled back:

- Keep old bundler code until Phase 6
- Feature flag: `AGENTUITY_USE_VITE=true` environment variable
- Gradual migration: support both bundlers during transition

### Full Rollback

If critical issues arise:

1. Revert commits from Phase 6 → Phase 1
2. Remove Vite dependencies
3. Restore old bundler files from git history
4. Update tests to remove Vite-specific code

## Performance Targets

### Build Time

- **Current (Bun):** ~2-3s for small app (with source mutation overhead)
- **Target (Vite):** ≤2s for small app (faster due to read-only AST + Vite optimizations)
- **Improvement:** Read-only AST analysis eliminates source mutation overhead

### Dev Server Startup

- **Current (Bun):** ~1-2s
- **Target (Vite):** ≤2s

### HMR

- **Current (Bun):** Full page reload (~500ms)
- **Target (Vite):** Fast HMR (≤100ms) for both client AND server code

### AST Analysis Performance

- **Current:** Parse + Mutate agent/eval files
- **New:** Parse only (read-only) - **~50% faster** for AST phase
- **Why faster:** No code generation, no source rewriting, no file I/O for mutations

## Dependencies

### New Dependencies

```json
{
	"dependencies": {
		"magic-string": "^0.30.0"
	},
	"devDependencies": {
		"vite": "^7.2.7",
		"@vitejs/plugin-react": "^5.1.2",
		"@hono/vite-dev-server": "^0.23.0",
		"@hono/vite-build": "^1.8.0",
		"@types/magic-string": "^0.30.0"
	}
}
```

### Removed Dependencies

- None (Bun is still the runtime)

### Why magic-string?

**Critical for source maps:** Our plugin injects code into `app.ts` (route mounting, agent initialization). Without proper source map handling:

- ❌ Debugger shows wrong line numbers
- ❌ Stack traces point to incorrect locations
- ❌ Dev tools show transformed code instead of original

**magic-string benefits:**

- ✅ Industry standard (used by Vite core and most plugins)
- ✅ Tracks all string mutations
- ✅ Generates accurate source maps
- ✅ Lightweight and fast
- ✅ Simple API: `s.appendRight()`, `s.prependLeft()`, `s.overwrite()`

**Example usage in plugin:**

```typescript
import MagicString from 'magic-string';

function transform(code: string, id: string) {
	const s = new MagicString(code);

	// Find insertion point via AST
	const insertPos = findCreateAppEndPosition(code);

	// Inject code while preserving source maps
	s.appendRight(
		insertPos,
		`
    // Auto-generated route mounting
    router.route('/api', apiRouter);
  `
	);

	return {
		code: s.toString(),
		map: s.generateMap({
			hires: true,
			source: id,
			includeContent: true,
		}),
	};
}
```

## File Structure Changes

### Before (Bun Bundler)

```
project/
├── src/
│   ├── agent/
│   ├── api/
│   ├── web/
│   └── app.ts
├── dist/
│   ├── app.js
│   ├── web/
│   └── workbench/
└── .agentuity/
    └── registry.generated.ts
```

### After (Vite)

```
project/
├── src/
│   ├── agent/
│   ├── api/
│   ├── web/
│   │   └── main.tsx  (entry point)
│   ├── workbench/
│   │   └── main.tsx  (entry point)
│   └── app.ts
└── .agentuity/
    ├── .vite/                     # Ephemeral build artifacts (gitignored, excluded from zip)
    │   └── vite.config.ts
    ├── app.js                     # Server bundle (deploy this)
    ├── agentuity.metadata.json    # Manifest (deploy this)
    ├── .routemapping.json         # Route mapping (deploy this)
    ├── registry.generated.ts      # Agent registry (build-time)
    ├── client/                    # Client assets (upload to CDN)
    │   ├── assets/
    │   │   ├── main-abc123.js
    │   │   ├── main-abc123.css
    │   │   └── logo-xyz789.svg
    │   └── .vite/manifest.json
    └── workbench/                 # Workbench assets (upload to CDN)
        ├── assets/
        │   ├── main-def456.js
        │   └── main-def456.css
        └── .vite/manifest.json
```

**Key Changes:**

- ✅ Output folder is `.agentuity/` (not `dist/`)
- ✅ Vite config at `.agentuity/.vite/vite.config.ts` (ephemeral, gitignored, excluded from deployment)
- ✅ Server bundle at `.agentuity/app.js` (root level, not in subdirectory)
- ✅ Client/workbench assets in `.agentuity/client/` and `.agentuity/workbench/` (for CDN upload)
- ✅ Only `app.js`, `agentuity.metadata.json`, and `.routemapping.json` are deployed to runtime (assets served from CDN)

## Open Questions

- [ ] How to handle Bun-specific imports in server code with Vite?
   - **Answer:** Use `@hono/vite-build/bun` which handles Bun runtime
- [ ] Should we support esbuild plugins via Vite?
   - **Answer:** Document migration path for common esbuild plugins to Vite equivalents
- [ ] How to handle patching (ai-sdk, etc.) in Vite?
   - **Answer:** Port patch logic to Vite plugin using `resolveId` + `load` hooks
- [ ] Dev mode: separate client/server processes or single Vite server?
   - **Answer:** Single Vite server using `@hono/vite-dev-server`

## Success Criteria

- ✅ `agentuity dev` provides HMR for React components
- ✅ `agentuity build` produces deployable artifacts
- ✅ All existing tests passing with Vite
- ✅ Build time comparable to Bun bundler
- ✅ Dev server startup time ≤2s
- ✅ No breaking changes for existing projects
- ✅ Workbench works in both dev and production
- ✅ Agent/route discovery works identically
- ✅ Deployment workflow unchanged

## Timeline

**Total Duration:** 6 weeks (with buffer)

| Phase               | Duration | Milestone               |
| ------------------- | -------- | ----------------------- |
| Phase 1: Foundation | Week 1   | Vite builds working     |
| Phase 2: Discovery  | Week 2   | AST analysis ported     |
| Phase 3: Build      | Week 3   | `agentuity build` works |
| Phase 4: Dev        | Week 4   | `agentuity dev` works   |
| Phase 5: Runtime    | Week 5   | Production deploys work |
| Phase 6: Cleanup    | Week 6   | Migration complete      |

---

## Next Steps

1. **Review this plan** - Get alignment on approach
2. **Create feature branch** - `feature/vite-migration`
3. **Start Phase 1** - Set up Vite infrastructure
4. **Daily standups** - Track progress and blockers
5. **Weekly demos** - Show working functionality

## Notes

- Keep old bundler code until Phase 6 for safety
- Test each phase thoroughly before moving to next
- Update AGENTS.md as we learn new patterns
- Document any deviations from this plan
