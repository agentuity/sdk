# Configuration Reference

The `agentuity.config.ts` file controls how your Agentuity project is built and deployed. It lives at the root of your project alongside `agentuity.json` and is completely optional — all fields have sensible defaults.

## File Structure

Create an `agentuity.config.ts` file in your project root with a default export:

```typescript
import type { AgentuityConfig } from '@agentuity/cli';

export default {
	// your configuration here
} satisfies AgentuityConfig;
```

**Key points:**

- The file must export a **default export** of type `AgentuityConfig`
- Use `satisfies AgentuityConfig` for type checking without narrowing the type
- The file is loaded via Bun's native TypeScript support — no compilation step needed
- All fields are optional. Omit the file entirely if the defaults work for you

## Configuration Options

### `render`

Controls how the web frontend (`src/web/`) is rendered.

| Value | Description |
| --- | --- |
| `'spa'` | **(default)** Single-page application with client-side routing |
| `'static'` | Pre-renders all routes to static HTML at build time (SSG) |

```typescript
export default {
	render: 'static',
} satisfies AgentuityConfig;
```

**Static rendering** requires `src/web/entry-server.tsx` that exports:

- `render(url: string)` — Returns an HTML string for the given URL
- `routeTree` (optional) — Route tree for automatic path discovery
- `getStaticPaths()` (optional) — Returns an array of URL paths to pre-render (for parameterized routes)

If neither `routeTree` nor `getStaticPaths()` is exported, the build will fail with an error.

---

### `workbench`

Configures the Workbench — a visual UI for testing agents during development. The workbench is **only active in dev mode** and is never included in production builds.

```typescript
export default {
	workbench: {
		route: '/workbench',
		headers: {},
	},
} satisfies AgentuityConfig;
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `route` | `string` | `'/workbench'` | URL path where the workbench UI is served |
| `headers` | `Record<string, string>` | `{}` | Custom headers sent with workbench requests |

**Presence enables the workbench.** Including a `workbench` object (even empty) turns it on. Omit the field entirely to disable it.

```typescript
// Workbench enabled with defaults
export default {
	workbench: {},
} satisfies AgentuityConfig;

// Workbench disabled (omit the field)
export default {} satisfies AgentuityConfig;
```

---

### `analytics`

Configures web analytics for frontend applications. Analytics is enabled by default when a web frontend exists (`src/web/index.html`).

```typescript
// Disable analytics entirely
export default {
	analytics: false,
} satisfies AgentuityConfig;

// Enable with custom options
export default {
	analytics: {
		requireConsent: true,
		trackForms: true,
		sampleRate: 0.5,
	},
} satisfies AgentuityConfig;
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Enable or disable analytics |
| `requireConsent` | `boolean` | `false` | When `true`, analytics is a no-op until `optIn()` is called |
| `trackClicks` | `boolean` | `true` | Track click events on elements with `data-analytics` attribute |
| `trackScroll` | `boolean` | `true` | Track scroll depth (25%, 50%, 75%, 100%) |
| `trackOutboundLinks` | `boolean` | `true` | Track outbound link clicks |
| `trackForms` | `boolean` | `false` | Track form submissions |
| `trackWebVitals` | `boolean` | `true` | Track Core Web Vitals (LCP, INP, CLS) |
| `trackErrors` | `boolean` | `true` | Track JavaScript errors |
| `trackSPANavigation` | `boolean` | `true` | Track client-side route changes as virtual pageviews |
| `sampleRate` | `number` | `1` | Sample rate from 0 to 1 (1 = 100% of events) |
| `excludePatterns` | `string[]` | — | URL patterns (regex strings) to exclude from tracking |
| `globalProperties` | `Record<string, unknown>` | — | Custom data included with every analytics event |

**Shorthand:** Set `analytics: false` to disable entirely, or `analytics: true` (the default) to enable with all defaults.

---

### `plugins`

Vite plugins for the client build (`src/web/`). These are added to the Vite configuration when building frontend assets.

```typescript
import type { AgentuityConfig } from '@agentuity/cli';
import react from '@vitejs/plugin-react';

export default {
	plugins: [react()],
} satisfies AgentuityConfig;
```

**Framework auto-detection:** If no framework plugin is detected in your plugins array, the React plugin (`@vitejs/plugin-react`) is added automatically for backwards compatibility. To use a different framework, include its Vite plugin:

```typescript
// Svelte
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default {
	plugins: [svelte()],
} satisfies AgentuityConfig;
```

Detected framework plugin prefixes: `vite:react`, `vite:preact`, `vite-plugin-svelte`, `vite:vue`, `vite-plugin-solid`, `solid`.

**Adding non-framework plugins** (e.g., Tailwind CSS) alongside the default React plugin:

```typescript
import type { AgentuityConfig } from '@agentuity/cli';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default {
	plugins: [react(), tailwindcss()],
} satisfies AgentuityConfig;
```

---

### `define`

Additional compile-time constants for code replacement in Vite builds. These are merged with Agentuity's built-in defines.

```typescript
export default {
	define: {
		__APP_VERSION__: JSON.stringify('1.2.3'),
		__FEATURE_FLAG__: JSON.stringify(true),
	},
} satisfies AgentuityConfig;
```

**Restrictions:** You cannot override Agentuity's built-in defines:

- `AGENTUITY_PUBLIC_*` — Reserved for Agentuity public environment variables
- `process.env.NODE_ENV` — Set automatically based on build mode

---

### `bundle`

Glob patterns for additional files to include in the deployment package. Use this to ship data files, templates, configuration files, or other non-code assets alongside your agents.

```typescript
export default {
	bundle: ['data/**', 'templates/*.json', 'models/weights.bin'],
} satisfies AgentuityConfig;
```

**How it works:**

1. Before the build runs, files matching the glob patterns are copied into the `.agentuity/` build output directory, preserving their relative paths from the project root
2. The build then runs as normal — if any build output conflicts with a bundled file name, **the build output takes priority** and overwrites it
3. When deployed, the bundled files are included in the deployment package and available at runtime

**Filtering:** Two layers of filtering protect against accidentally bundling sensitive or unnecessary files:

1. **Hard exclusions** (always applied, cannot be overridden):
   - `.agentuity/` — Build output directory
   - `node_modules/` — Dependencies (already handled by the bundler)
   - `.git/` — Git repository data
   - `.env`, `.env.*` — Environment files containing secrets

2. **`.gitignore` filtering** — Files ignored by your `.gitignore` are automatically excluded. This means build artifacts, editor files, OS files, and anything else in your `.gitignore` won't be bundled. If the project is not a git repository, this layer is skipped.

**Accessing bundled files at runtime:**

Bundled files are available at their original relative paths from the working directory. For example, if you bundle `data/prompts.json`, you can read it at runtime with:

```typescript
const prompts = await Bun.file('data/prompts.json').json();
```

**Use cases:**

- **Prompt templates:** Bundle Markdown or text files used as LLM prompt templates
- **Data files:** Include JSON, CSV, or other data files your agents need
- **ML models:** Ship model weights or configuration alongside your agents
- **Static configuration:** Include YAML, TOML, or other config files

**Example — bundling prompt templates and data:**

```
my-project/
├── agentuity.config.ts
├── agentuity.json
├── prompts/
│   ├── system.md
│   └── few-shot-examples.json
├── data/
│   └── knowledge-base.json
└── src/
    └── agents/
        └── assistant/
            └── index.ts
```

```typescript
// agentuity.config.ts
import type { AgentuityConfig } from '@agentuity/cli';

export default {
	bundle: ['prompts/**', 'data/**'],
} satisfies AgentuityConfig;
```

```typescript
// src/agents/assistant/index.ts
import { agent } from '@agentuity/runtime';

export default agent({
	async handler(request, response, context) {
		const systemPrompt = await Bun.file('prompts/system.md').text();
		const examples = await Bun.file('prompts/few-shot-examples.json').json();
		// Use the bundled files in your agent logic
	},
});
```

---

## Complete Example

Here is a full configuration demonstrating all options:

```typescript
import type { AgentuityConfig } from '@agentuity/cli';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default {
	// Static site generation
	render: 'static',

	// Enable workbench in dev mode
	workbench: {
		route: '/workbench',
		headers: {
			'X-Custom-Header': 'value',
		},
	},

	// Analytics with consent requirement
	analytics: {
		requireConsent: true,
		trackForms: true,
		sampleRate: 0.5,
		excludePatterns: ['/admin/.*'],
	},

	// Vite plugins for the frontend build
	plugins: [react(), tailwindcss()],

	// Build-time constants
	define: {
		__APP_VERSION__: JSON.stringify('2.0.0'),
	},

	// Extra files to include in the deployment
	bundle: ['prompts/**', 'data/*.json'],
} satisfies AgentuityConfig;
```

## Minimal Examples

**Agents only (no web frontend):**

```typescript
import type { AgentuityConfig } from '@agentuity/cli';

export default {
	bundle: ['data/**'],
} satisfies AgentuityConfig;
```

**React app with workbench:**

```typescript
import type { AgentuityConfig } from '@agentuity/cli';
import react from '@vitejs/plugin-react';

export default {
	workbench: {
		route: '/workbench',
	},
	plugins: [react()],
} satisfies AgentuityConfig;
```

**Svelte app:**

```typescript
import type { AgentuityConfig } from '@agentuity/cli';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default {
	workbench: {},
	plugins: [svelte()],
} satisfies AgentuityConfig;
```

## How It Works

The configuration file is loaded during `agentuity build` (or `agentuity dev`) via Bun's native `import()`. This means:

- TypeScript is supported directly — no compilation needed
- You can import and use any installed packages (e.g., Vite plugins)
- The file is evaluated at build time, not at runtime
- If the file is missing or has no default export, all defaults are used

### Build Pipeline

The configuration integrates into the build pipeline at these points:

1. **Clean** — `.agentuity/` directory is removed (production builds only)
2. **Load config** — `agentuity.config.ts` is loaded
3. **Bundle files** — If `bundle` patterns are configured, matching files are copied into `.agentuity/`
4. **Workbench** — If `workbench` is configured and in dev mode, workbench files are generated
5. **Agent & route discovery** — Agents and routes in `src/` are discovered
6. **Client build** — Vite builds `src/web/` using `plugins`, `define`, `analytics`, and `render` config
7. **Static rendering** — If `render: 'static'`, routes are pre-rendered to HTML
8. **Server build** — Bun bundles the server entry point into `.agentuity/app.js`
9. **Metadata** — Build metadata is generated for deployment
