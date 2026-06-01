# Agent Guidelines for Docs App

## Overview

Agentuity docs app and SDK Explorer. This app serves as:

- Public documentation
- Interactive SDK Explorer demos
- Reference implementation for current docs app patterns
- Cloud sandbox execution environment for runnable examples

**Location**: `sdk/docs/`

## Commands

- **Build**: `bun run build` (compiles your application)
- **Dev**: `bun run dev` (starts development server)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Generate scripts**: `bun run generate:scripts`

Do not deploy from this repo unless explicitly asked.

When checking deploy failures, verify the project root first. This docs app
uses `docs/agentuity.json`; failures from another root may belong to a
separate project.

## Architecture

This app demonstrates:

- TanStack Start docs routes and generated route types
- MDX content rendered through docs route files
- API routes used by the SDK Explorer
- Reference examples using current framework route and service-client patterns
- Cloud sandbox execution for live code demos
- React 19 frontend with interactive demo components
- Tailwind CSS styling
- AI SDK integration with multiple providers (OpenAI, Anthropic, Google, Groq)

## Documentation and Explorer Guidelines

- Treat `src/web/code-examples.ts` as the code readers are most likely to copy. Keep those snippets complete, current, and aligned with the public docs.
- Prefer framework route handlers and direct service clients for new examples. Keep runtime compatibility patterns in place only where the Explorer still depends on them or where the page is explicitly about migration.
- Keep the interactive demo copy and the reference snippet in sync. If the sandbox script needs a compatibility path, explain that in code comments rather than in public UI copy.
- After adding a docs route, API route, or sandbox script, regenerate the relevant generated files and run the matching typecheck/build checks.

## Directory Structure

```text
docs/
├── src/
│   ├── agent/              # Compatibility agents used by some live demos
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
│   ├── web/                # TanStack Start + React frontend
│   │   ├── routes/         # Docs and Explorer routes
│   │   ├── content/        # MDX docs content and meta.json files
│   │   ├── demo-config.tsx # Explorer demo registry
│   │   ├── code-examples.ts# Explorer reference snippets
│   │   ├── hooks/          # useSandboxRunner hook
│   │   └── components/     # Docs and Explorer components
│   ├── generated/          # Auto-generated route types
│   └── lib/                # Shared utilities
├── app.ts                  # Application entry point
├── agentuity.config.ts     # Workbench and plugin config
├── agentuity.json          # Project metadata
├── agentuity-snapshot.yaml # Sandbox snapshot configuration
└── package.json            # Dependencies and scripts
```

## Web Frontend (src/web/)

The `src/web/` folder contains the TanStack Start docs app and React Explorer UI.

**File Structure:**

- `routes/` - TanStack route files for docs, Explorer, and demo pages
- `content/` - MDX files and `meta.json` sidebar ordering
- `components/docs/` - Docs layout, MDX rendering, cards, and navigation
- `components/*Demo.tsx` - SDK Explorer demo components
- `demo-config.tsx` - Explorer demo registry
- `code-examples.ts` - Code snippets displayed in Explorer pages
- `routeTree.gen.ts` - Generated TanStack route tree

**How It Works:**

1. Docs content lives in `src/web/content/**/*.mdx`.
2. Docs route files under `src/web/routes/_docs/` render that content with `MDXPage`.
3. Sidebar order comes from each directory's `meta.json`.
4. Explorer pages live under `src/web/routes/explorer/` and usually render `DemoView`.
5. TanStack route output is regenerated when route files change.

**Key Points:**

- Add docs pages through content, route, and `meta.json` changes together.
- Keep Explorer demo IDs synchronized across `demo-config.tsx`, route files, `code-examples.ts`, and sandbox scripts.
- Prefer existing docs components and Explorer patterns before adding new UI structure.
- Do not hand-edit generated files unless the adjacent AGENTS.md explicitly says to do so.

## Cloud Sandbox Architecture

The SDK Explorer includes a cloud sandbox system for executing demo scripts in isolated environments.

**Data Flow:**

```text
Browser
    -> useSandboxRunner hook
    -> GET /api/sandbox/run?script=hello&input=base64JSON
    -> route.ts validates script name against SCRIPT_NAMES
    -> interactive session looks up sandbox ID from KV (keyed by atid cookie)
    -> if found, reuses existing sandbox via sandboxExecute()
    -> if not found, creates new sandbox with mode: 'interactive' and stores ID in KV
    -> if interactive execution fails, falls back to one-shot sandboxRun()
    -> scripts are pre-baked into the sandbox snapshot
    -> returns output via SSE (Server-Sent Events)
    -> TerminalOutput component displays results
```

**Session Reuse:**

- Thread ID from `atid` cookie identifies the user session
- KV bucket `explorer-sessions` stores the thread ID to sandbox ID mapping
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
4. Add demo config to `DEMOS` in `src/web/demo-config.tsx`

## Workspace Integration

This app uses workspace dependencies:

- `@agentuity/hono`: `workspace:*`
- `@agentuity/core`: `workspace:*`
- `@agentuity/schema`: `workspace:*`
- Service clients such as `@agentuity/keyvalue`, `@agentuity/queue`,
  `@agentuity/sandbox`, `@agentuity/email`, and `@agentuity/vector`: `workspace:*`
- `@agentuity/cli`: `workspace:*`

Scripts use the locally-linked CLI binary: `agentuity ...` (resolved
via node_modules/.bin/agentuity, which Bun puts on PATH for npm
scripts). The binary is the published `bin/cli.js` shim, exercising
the shipped artifact rather than source TypeScript.

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
