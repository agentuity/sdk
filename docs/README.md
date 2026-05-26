# Agentuity SDK docs app

This package contains the current Agentuity v3 documentation site and the interactive Explorer demos.

The docs app has three main pieces:

- `src/web/content/`: MDX docs content
- `src/web/`: TanStack Start web app, docs navigation, and Explorer UI
- `src/api/`: Hono/Bun demo routes used by the Explorer

## Local development

Install workspace dependencies from the repo root first:

```bash
bun install
```

Then run the docs app:

```bash
cd docs
bun run dev
```

`bun run dev` starts two processes:

- web app on `http://localhost:3000`
- docs API server on `http://localhost:3001`

The Vite dev server proxies `/api/*` to the API process.

## Common commands

```bash
# Start local docs development
bun run dev

# Typecheck the docs package
bun run typecheck

# Build the docs app for deploy
bun run build

# Regenerate routes and verify every content page is served
bun run scripts/validate-routes.ts

# Regenerate API reference, nav data, and markdown exports
bun run prebuild
```

## Build and deploy

The docs app builds with TanStack Start, then writes a Bun launch wrapper for Agentuity packaging:

```bash
bun run build
```

To deploy the docs app through Agentuity:

```bash
bun run deploy
```

## Editing docs content

Docs content lives under `src/web/content/`. Each page needs:

- an MDX file in `src/web/content/`
- a matching route file in `src/web/routes/_docs/`
- a `meta.json` entry in the same content directory

Run the route validator after adding or moving pages:

```bash
bun run scripts/validate-routes.ts
```

## Source of truth

Treat these as the primary references when updating the docs app:

- `src/web/content/AGENTS.md` for docs structure and writing conventions
- `package.json` for runnable commands
- `app.ts`, `server.ts`, and `vite.config.ts` for the runtime shape
