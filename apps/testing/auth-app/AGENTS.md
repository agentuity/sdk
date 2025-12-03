# Agent Guidelines for test-app

## Commands

- **Build**: `bun run build` (runs bundler from parent monorepo)
- **Dev server**: `bun run dev` (runs built app from .agentuity/app.js)
- **Install**: `bun install`
- **Test**: No test runner configured (add if needed)

## Architecture

- **Runtime**: Bun-based Agentuity server app using Hono framework
- **Structure**: Agent-based architecture with agents in `src/agent/<name>/`
- **Entry point**: app.ts creates server via `@agentuity/runtime`
- **Build output**: `.agentuity/` contains generated code (app.js, etc)
- **Agent pattern**: Each agent has `agent.ts` (handler + schema) and optional `route.ts` (HTTP routes)
- **Dependencies**: Uses Zod for validation, Hono for routing, @agentuity packages for framework

## Code Style

- **TypeScript**: Strict mode, ESNext target, bundler moduleResolution, allowImportingTsExtensions
- **Imports**: Use @agentuity/\* for framework imports, relative paths for local modules
- **Agents**: Export default agent from agent.ts, define Zod schemas for input/output
- **Routes**: Use createRouter() from @agentuity/runtime, access agents via c.agent.<name>.run()
- **Validation**: Use @hono/zod-validator for request validation
- **Naming**: Agent folders are lowercase, use camelCase for variables/functions

## Testing

- **Setup**: Kill any existing server with `lsof -ti:3500 | xargs kill -9 2>/dev/null || true`
- **Server**: Start with `bun run .agentuity/app.js &> /tmp/server.log & sleep 5` (background with 5s startup delay)
- **Cleanup**: After tests, kill with `lsof -ti:3500 | xargs kill -9 2>/dev/null || true`
- **Endpoints**:
   - Web app at `/` (returns HTML with React)
   - Agents at `/agent/<agent-name>` (e.g., `/agent/simple`)
   - APIs at `/api/<api-name>` (e.g., `/api/foo`)
- **Web test**: `curl http://localhost:3500/`
- **Agent GET test**: `curl http://localhost:3500/agent/simple`
- **Agent POST test**: `curl http://localhost:3500/agent/simple --json '{"name":"Bob","age":30}'`
- **API test**: `curl http://localhost:3500/api/foo`
- **Validation test**: Send invalid data to verify Zod schema validation works
