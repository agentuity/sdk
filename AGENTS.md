# Agent Guidelines for Agentuity TypeScript Monorepo

## Commands

- **Build**: `bun run build` (root), individual packages: `cd packages/<name> && bun run build`
- **Typecheck**: `bun run typecheck` (root), individual: `bunx tsc --noEmit` in package dir
- **Lint**: `bunx eslint packages`
- **Format**: `bunx prettier */** --write --fix`
- **Test**: `bun test` (uses Bun's built-in test runner)
- **Clean**: `bun run clean` (removes all dist/ and .tsbuildinfo files)

## Architecture

- **Monorepo**: Bun workspaces with 4 packages in `packages/`: `core`, `react`, `server`, `bundler`
- **@agentuity/core**: Shared utilities and schemas, foundation for other packages
- **@agentuity/react**: Browser-only React components, depends on core
- **@agentuity/server**: Bun server runtime using Hono framework, depends on core
- **@agentuity/bundler**: CLI bundler tool with bin entry point
- **Cross-package imports**: Use workspace protocol `@agentuity/<package>` in package.json dependencies

## Code Style

- **Formatter**: Prettier with tabs (width 3), single quotes, semicolons, 100 char line width
- **TypeScript**: Strict mode, ESNext target, bundler moduleResolution, composite project references
- **Linter**: ESLint with TypeScript, React, and JSON support
- **Naming**: Export all public APIs from package `index.ts`, use named exports
- **Build targets**: `react` = browser, `server`/`bundler` = bun runtime
