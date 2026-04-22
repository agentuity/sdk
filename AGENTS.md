# Agent Guidelines for Agentuity TypeScript Monorepo

## Commands

- **Build**: `bun run build` (root or individual package)
- **Typecheck**: `bun run typecheck`
- **Lint**: `bun run lint`
- **Format**: `bun run format`
- **Test**: `bun run test`
- **Clean**: `bun run clean`
- **All checks**: `bun run all`

## Architecture

Bun workspaces monorepo with packages in `packages/`:

| Package       | Runtime  | Description                                          |
| ------------- | -------- | ---------------------------------------------------- |
| `core`        | Node/Bun | Shared types and utilities (publish first)           |
| `schema`      | Any      | Schema validation (StandardSchema v1)                |
| `server`      | Node/Bun | Runtime-agnostic server utilities                    |
| `runtime`     | Bun      | Hono-based server runtime with WebRTC signaling      |
| `react`       | Browser  | React hooks for agents and WebRTC                    |
| `frontend`    | Browser  | Framework-agnostic web utilities with WebRTC manager |
| `auth`        | Both     | Authentication providers (Clerk, etc.)               |
| `claude-code` | Bun      | Claude Code plugin with multi-agent coding team      |
| `cli`         | Bun      | CLI framework with commander.js                      |
| `postgres`    | Node/Bun | Resilient PostgreSQL client with auto-reconnection   |
| `drizzle`     | Node/Bun | Drizzle ORM integration with resilient connections   |
| `opencode`    | Bun      | Opencoder agent plugins for Agentuity                |
| `vscode`      | Node     | VS Code extension for Agentuity                      |
| `test-utils`  | Test     | Private test helpers (never published)               |

## Code Style

- **Formatter**: Biome - tabs (width 3), single quotes, semicolons, lineWidth 100, trailingCommas es5
- **TypeScript**: Strict mode, ESNext, bundler moduleResolution
- **Exports**: Named exports from package `index.ts`
- **Errors**: Use `StructuredError` from `@agentuity/core`

## Testing

**Conventions:**

- Tests live in `test/` folder parallel to `src/` (never inside `src/` or under `__tests__/`).
- Import from `../src/` in tests.
- Each package has `tsconfig.json` (excludes `test/`) and a separate `tsconfig.test.json` (includes both).
- Use `@agentuity/test-utils` for shared mocks.
- All errors AND warnings must be zero before shipping.
- When running test suites, prefer a subagent (Task tool) to avoid context bloat from test output.

Repo-level test apps live under `tests/`:
- `tests/frameworks/` — full framework demos with Playwright e2e
- `tests/services/` — per-service client smoke tests
- `tests/integration/` — app-level integration targets (Hono apps, OAuth, etc.)

## Special Instructions

- **Verification**: Run format, lint, typecheck, build, test before committing
- **Main branch**: NEVER commit directly
- **Documentation**: Don't create docs unless explicitly asked
- **Clarification**: Ask before major code changes if unsure
