# Agent Guidelines for SDK Explorer (apps/docs)

## Overview

Interactive showcase of the Agentuity v1 SDK. This app serves as:

- Live documentation with working demos
- Reference implementation for SDK patterns
- Testing ground for new features
- Cloud sandbox execution environment for live code demos

**Location**: `sdk/apps/docs/`

## Commands

- **Build**: `bun run build` (compiles your application)
- **Dev**: `bun run dev` (starts development server)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Deploy**: `bun run deploy` (deploys your app to the Agentuity cloud)

## Architecture

This app demonstrates:

- Multiple agent implementations showcasing SDK patterns
- API routes (REST, streaming, SSE, WebSocket)
- Cloud sandbox execution for live code demos
- React 19 frontend with interactive demo components
- Tailwind CSS styling
- AI SDK integration with multiple providers (OpenAI, Anthropic, Google, Groq)

## Directory Structure

```text
apps/docs/
├── src/
│   ├── agent/              # Agent implementations
│   │   ├── hello/          # Basic greeting agent
│   │   ├── chat/           # Conversational agent with memory
│   │   ├── context/        # AgentContext API exploration
│   │   ├── kv/             # Key-value storage operations
│   │   ├── vector/         # Semantic search agent
│   │   ├── objectstore/    # S3/object storage agent
│   │   ├── model-arena/    # Multi-model comparison with LLM-as-judge
│   │   └── ...             # (see src/agent/AGENTS.md)
│   ├── api/                # HTTP routes
│   │   ├── hello/          # Basic greeting endpoint
│   │   ├── chat/           # Chat endpoint
│   │   ├── streaming/      # Raw text streaming
│   │   ├── sse-stream/     # Server-Sent Events streaming
│   │   ├── sandbox/        # Cloud sandbox execution
│   │   └── ...             # (see src/api/AGENTS.md)
│   ├── run/                # Standalone demo scripts
│   │   ├── hello.ts        # Basic agent invocation
│   │   ├── chat.ts         # Conversational demo
│   │   ├── kv.ts           # KV storage demo
│   │   └── ...             # (see src/run/AGENTS.md)
│   ├── web/                # React frontend
│   │   ├── App.tsx         # Main app with demo config
│   │   ├── frontend.tsx    # Entry point with HMR
│   │   ├── hooks/          # useSandboxRunner hook
│   │   └── components/     # Demo components + utilities
│   ├── generated/          # Auto-generated route types
│   └── lib/                # Shared utilities
├── app.ts                  # Application entry point
├── agentuity.config.ts     # Workbench and plugin config
├── agentuity.json          # Project metadata
├── agentuity-snapshot.yaml # Sandbox snapshot configuration
└── package.json            # Dependencies and scripts
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

## Cloud Sandbox Architecture

The SDK Explorer includes a cloud sandbox system for executing demo scripts in isolated environments.

**Data Flow:**

```text
Browser → useSandboxRunner hook
    → GET /api/sandbox/run?script=hello&input=base64JSON
    → route.ts validates script name against SCRIPT_NAMES
    → Interactive session: Looks up sandbox ID from KV (keyed by atid cookie)
    → If found: Reuses existing sandbox via sandboxExecute()
    → If not found: Creates new sandbox with mode: 'interactive', stores ID in KV
    → Fallback: If interactive path fails, falls back to one-shot sandboxRun()
    → Scripts are pre-baked into the sandbox snapshot
    → Returns output via SSE (Server-Sent Events)
    → TerminalOutput component displays results
```

**Session Reuse:**

- Thread ID from `atid` cookie identifies the user session
- KV bucket `explorer-sessions` stores `threadId → sandboxId` mapping
- Sandbox created without initial command (stays in `idle` state until executed)
- 10-min idle timeout for automatic cleanup
- KV TTL refreshed on each use to keep active sessions alive
- If sandbox expires or KV fails, falls back to one-shot execution

**Key Components:**

- `src/api/sandbox/route.ts` - SSE endpoint that executes scripts in sandboxes
- `src/api/sandbox/scripts.ts` - Script names and default inputs (generated)
- `src/run/*.ts` - Runnable script files (baked into the sandbox snapshot)
- `src/web/hooks/useSandboxRunner.ts` - React hook for sandbox execution
- `src/web/components/TerminalOutput.tsx` - Displays streaming output

**SSE Events:**

- `status` - Sandbox status ('creating', 'running')
- `stdout` - Streamed output chunks
- `done` - Completion with `{ exitCode: number }`
- `error` - Error message

**Adding a New Demo Script:**

1. Create the script in `src/run/newscript.ts`
2. Run `bun run generate:scripts` to regenerate script metadata
3. Rebuild the sandbox snapshot to include the new script
4. Add demo config to `DEMOS` array in `src/web/App.tsx`

## Workspace Integration

This app uses workspace dependencies:

- `@agentuity/runtime`: `workspace:*`
- `@agentuity/react`: `workspace:*`
- `@agentuity/schema`: `workspace:*`
- `@agentuity/workbench`: `workspace:*`
- `@agentuity/cli`: `workspace:*`

Scripts use the local CLI directly: `bun ../../packages/cli/bin/cli.ts`

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
