# Vite POC Analysis - How @hono/vite-dev-server Works

Based on analysis of the working prototype at `/Users/jhaynie/tmp/proto`

## Summary

The prototype demonstrates a **simple, clean integration** of Vite + Hono + Bun where:

- **One entry file** (`index.ts`) contains all server code and route definitions
- **Vite dev server** runs this entry file directly via `@hono/vite-dev-server`
- **No code generation or injection** - everything is explicit in the entry file
- **Two build modes**: client mode (React assets) and server mode (SSR bundle)

## Key Architecture Points

### 1. Entry File Structure (`index.ts`)

```typescript
import { Hono } from 'hono';
import users from './src/apis/users';
import posts from './src/apis/posts';

const app = new Hono();

// Manually mount routes
app.route('/api/users', users);
app.route('/api/posts', posts);

// Serve static assets in production
if (import.meta.env.PROD) {
	app.use('/assets/*', serveStatic({ root: './dist/static' }));
}

// Web route - checks DEV vs PROD
app.get('/', (c) => {
	if (import.meta.env.PROD) {
		// Load manifest and inject hashed asset URLs
		const manifest = require('./dist/static/.vite/manifest.json');
		return c.html(`... <script src="/${manifest['src/web/main.tsx'].file}"></script>`);
	}

	// Dev mode: inject Vite HMR scripts
	return c.html(`
    <script type="module" src="/@vite/client"></script>
    <script type="module" src="/src/web/main.tsx"></script>
  `);
});

// CRITICAL: Export the Hono instance
export default app;
```

**Key insights:**

- ✅ Entry file is a **bare Hono app** (no wrapper, no framework abstraction)
- ✅ Routes are **explicitly mounted** by the user
- ✅ Web serving logic is **inline** using `import.meta.env.PROD/DEV`
- ✅ **Exports `export default app`** (the Hono instance)

### 2. Vite Configuration (`vite.config.ts`)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import adapter from '@hono/vite-dev-server/bun';
import build from '@hono/vite-build/bun';

export default defineConfig(({ mode }) => {
	if (mode === 'client') {
		// Client build: React app → dist/static/
		return {
			plugins: [react()],
			build: {
				outDir: 'dist/static',
				rollupOptions: { input: './src/web/main.tsx' },
				manifest: true,
			},
		};
	} else {
		// Server build: SSR bundle → dist/index.js
		return {
			plugins: [
				react(),
				devServer({
					entry: 'index.ts', // Entry file to run in dev mode
					adapter, // Bun adapter
				}),
				build({
					entry: 'index.ts', // Entry file for production build
				}),
			],
		};
	}
});
```

**Key insights:**

- ✅ **Two build modes** triggered by Vite's `mode` flag
- ✅ `devServer()` plugin points to `entry: 'index.ts'`
- ✅ `@hono/vite-dev-server` **expects the entry file to export a Hono instance**
- ✅ Client build produces manifest at `dist/static/.vite/manifest.json`

### 3. Dev Mode Workflow

```bash
bun run dev  # → bunx --bun vite
```

**What happens:**

1. Vite starts in **default mode** (server mode, not client mode)
2. `@hono/vite-dev-server` plugin:
   - Imports `index.ts`
   - Gets the exported Hono app
   - Runs the app using Bun adapter
   - Intercepts requests to `/src/*` and serves them via Vite's middleware (HMR enabled)
3. When browser requests `/`:
   - Hono route handler runs
   - Checks `import.meta.env.DEV === true`
   - Returns HTML with `<script src="/@vite/client">` and `<script src="/src/web/main.tsx">`
4. When browser requests `/src/web/main.tsx`:
   - `@hono/vite-dev-server` intercepts
   - Vite transforms the React code
   - Returns transpiled JS with HMR enabled

**Result:** Single dev server on one port serving both API routes (via Hono) and client assets (via Vite HMR).

### 4. Production Build Workflow

```bash
bun run build  # → vite build --mode client && vite build
```

**What happens:**

1. **Client build** (`--mode client`):
   - Vite config returns client mode config
   - Bundles `src/web/main.tsx` → `dist/static/assets/main-[hash].js`
   - Generates manifest at `dist/static/.vite/manifest.json`
2. **Server build** (default mode):
   - Vite config returns server mode config
   - `@hono/vite-build` plugin bundles `index.ts` → `dist/index.js`
   - Result is a standalone Bun-compatible server bundle

**Production runtime:**

```bash
bun run dist/index.js  # Runs the bundled server
```

The server:

- Checks `import.meta.env.PROD === true`
- Loads `dist/static/.vite/manifest.json`
- Serves static files from `dist/static/assets/`
- Returns HTML with hashed asset URLs from manifest

### 5. File Structure

```
proto/
├── index.ts              # Entry file (exports Hono app)
├── vite.config.ts        # Two-mode Vite config
├── src/
│   ├── apis/
│   │   ├── users.ts      # Hono subrouter
│   │   └── posts.ts      # Hono subrouter
│   └── web/
│       ├── main.tsx      # React entry point
│       └── App.tsx       # React component
└── dist/                 # Build output
    ├── index.js          # Server bundle (SSR)
    └── static/           # Client bundle
        ├── .vite/
        │   └── manifest.json
        └── assets/
            └── main-[hash].js
```

## Key Differences from Our Current Approach

### Prototype (Simple)

- ✅ **Entry file is bare Hono** - no abstraction
- ✅ **User explicitly mounts routes** - no auto-discovery
- ✅ **No code generation/injection** - everything is visible
- ✅ **Exports Hono instance directly**
- ✅ **Web logic inline** using `import.meta.env.PROD/DEV`

### Our SDK (Complex)

- ❌ Entry file uses `createApp()` wrapper (App abstraction)
- ❌ Plugin auto-discovers and injects route mounting code
- ❌ Plugin tries to inject web serving logic
- ❌ Plugin tries to export `app.router` via code injection
- ❌ Multiple layers of indirection

## What We Need to Change

### Option 1: Match the Prototype Pattern

**User's `app.ts` should be:**

```typescript
import { createRouter } from '@agentuity/runtime';
import apiRouter from './src/api/index.js'; // Auto-generated by plugin

const app = createRouter();

// Plugin-generated code mounts routes here
app.route('/api', apiRouter);

// Plugin-generated web serving logic
if (import.meta.env.PROD) {
	app.use('/assets/*', serveStatic({ root: './.agentuity/client' }));
	app.get('/', serveStatic({ path: './.agentuity/client/index.html' }));
} else {
	app.get('/', (c) => c.html(`... Vite HMR scripts ...`));
}

// Export for @hono/vite-dev-server
export default app;
```

**Changes needed:**

1. Template `app.ts` exports bare router (not `createApp()` wrapper)
2. Plugin generates `src/api/index.js` that exports a Hono subrouter
3. Plugin injects route mounting + web serving logic into `app.ts`
4. Plugin ensures `export default app` exists

### Option 2: Generate Separate Entry File

**User's `app.ts` stays clean:**

```typescript
import { createApp } from '@agentuity/runtime';

const { server, logger } = await createApp({
	setup: async () => ({
		/* user state */
	}),
});

logger.debug('Running %s', server.url);
```

**Plugin generates `.agentuity/_entry.ts`:**

```typescript
import { createRouter } from '@agentuity/runtime';
import apiRouter from '../src/api/index.js'; // Plugin-generated

const app = createRouter();

// Auto-generated route mounting
app.route('/api', apiRouter);

// Auto-generated web serving
if (import.meta.env.PROD) {
	app.use('/assets/*', serveStatic({ root: './.agentuity/client' }));
	app.get('/', serveStatic({ path: './.agentuity/client/index.html' }));
} else {
	app.get('/', (c) => c.html(`... Vite HMR scripts ...`));
}

export default app;
```

**vite.config.ts points to generated entry:**

```typescript
devServer({ entry: '.agentuity/_entry.ts', adapter });
```

**Changes needed:**

1. Plugin generates complete entry file at `.agentuity/_entry.ts`
2. Template vite.config.ts uses generated entry
3. User's `app.ts` is untouched (not used in dev mode)

## Recommended Approach

**Use Option 2 (Generate Separate Entry File)** because:

1. ✅ **User's app.ts stays clean** - matches their expectation
2. ✅ **No code injection** - all generated code is in separate file
3. ✅ **Clear separation** - user code vs framework code
4. ✅ **Easier debugging** - generated file is visible and inspectable
5. ✅ **Works with @hono/vite-dev-server** - just point entry to generated file

## Implementation Plan

1. **Plugin generates `.agentuity/_entry.ts`:**
   - Create bare Hono router
   - Auto-discover and mount API routes
   - Add web serving logic (dev vs prod)
   - Export the router

2. **Template vite.config.ts:**
   - Points `devServer({ entry: '.agentuity/_entry.ts' })`
   - Points `build({ entry: '.agentuity/_entry.ts' })`

3. **User's app.ts:**
   - Keep clean `createApp()` pattern
   - Only used when they want to run custom server logic
   - Not involved in Vite dev/build workflow

4. **Build output:**
   - Client: `.agentuity/client/` (React assets + manifest)
   - Server: `.agentuity/app.js` (bundled from `_entry.ts`)

This matches the prototype's simplicity while preserving the clean user-facing API.
