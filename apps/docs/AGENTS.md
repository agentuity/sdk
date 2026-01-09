# Agent Guidelines for SDK Explorer (apps/docs)

## Overview

Interactive showcase of the Agentuity v1 SDK. This app serves as:

- Live documentation with working demos
- Reference implementation for SDK patterns
- Testing ground for new features

**Location**: `sdk/apps/docs/`

## Commands

- **Build**: `bun run build` (compiles your application)
- **Dev**: `bun run dev` (starts development server)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Deploy**: `bun run deploy` (deploys your app to the Agentuity cloud)

## Architecture

This app demonstrates:

- Multiple agent implementations (hello, chat, kv, vector, evals, model-arena, etc.)
- API routes for various patterns (REST, streaming, SSE, WebSocket)
- React 19 frontend with interactive demos
- Tailwind CSS styling
- AI SDK integration with multiple providers

## Directory Structure

```
apps/docs/
├── src/
│   ├── agent/           # Agent implementations
│   │   ├── hello/       # Basic greeting agent
│   │   ├── chat/        # Conversational agent with memory
│   │   ├── kv/          # Key-value storage operations
│   │   ├── vector/      # Semantic search agent
│   │   ├── evals/       # Agent with quality evaluations
│   │   └── model-arena/ # Multi-model comparison
│   ├── api/             # HTTP routes
│   ├── web/             # React frontend
│   │   ├── App.tsx      # Main app with demo config
│   │   ├── frontend.tsx # Entry point
│   │   └── components/  # Demo components
│   └── lib/             # Shared utilities
├── app.ts               # Application entry point
├── agentuity.config.ts  # Workbench and plugin config
├── agentuity.json       # Project metadata
└── package.json         # Dependencies and scripts
```

## Web Frontend (src/web/)

The `src/web/` folder contains your React frontend, which is automatically bundled by the Agentuity build system.

**File Structure:**

- `index.html` - Main HTML file with `<script type="module" src="./frontend.tsx">`
- `frontend.tsx` - Entry point that renders the React app to `#root`
- `App.tsx` - Your main React component
- `public/` - Static assets (optional)

**How It Works:**

1. The build system automatically bundles `frontend.tsx` and all its imports (including `App.tsx`)
2. The bundled JavaScript is placed in `.agentuity/web/chunk/`
3. The HTML file is served at the root `/` route
4. Script references like `./frontend.tsx` are automatically resolved to the bundled chunks

**Key Points:**

- Use proper TypeScript/TSX syntax - the bundler handles all compilation
- No need for Babel or external bundlers
- React is bundled into the output (no CDN needed)
- Supports hot module reloading in dev mode with `import.meta.hot`
- Components can use all modern React features and TypeScript

## Workspace Integration

This app uses workspace dependencies:

- `@agentuity/runtime`: `workspace:*`
- `@agentuity/react`: `workspace:*`
- `@agentuity/schema`: `workspace:*`
- `@agentuity/workbench`: `workspace:*`
- `@agentuity/evals`: `workspace:*`
- `@agentuity/cli`: `workspace:*`

Scripts use the local CLI directly: `bun ../../packages/cli/bin/cli.ts`

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
