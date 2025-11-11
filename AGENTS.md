# Agent Guidelines for Agentuity TypeScript Monorepo

## Commands

- **Build**: `bun run build` (root), individual packages: `cd packages/<name> && bun run build`
- **Typecheck**: `bun run typecheck` (root), individual: `bunx tsc --noEmit` in package dir
- **Lint**: `bunx eslint packages`
- **Format**: `bunx prettier */** --write --fix`
- **Test**: `bun run test` (prefer over Bun's built-in test runner to pick up other test scripts)
- **Clean**: `bun run clean` (removes all dist/ and .tsbuildinfo files)
- **Test Everything**: `bun run all` will run all the commands together to validate and test

## Architecture

- **Monorepo**: Bun workspaces with 5 packages in `packages/`: `core`, `react`, `runtime`, `server`, `cli`
- **@agentuity/core**: Shared utilities and schemas, foundation for other packages
- **@agentuity/react**: Browser-only React components, depends on core
- **@agentuity/runtime**: Bun server runtime using Hono framework, depends on core
- **@agentuity/server**: Runtime-agnostic server utilities for Node.js and Bun, depends on core
- **@agentuity/cli**: Bun-native CLI framework with commander.js, auto-discovery, and YAML config
- **Cross-package imports**: Use workspace protocol `@agentuity/<package>` in package.json dependencies
- **Test Apps**: The `apps/testing` folder contains multiple test applications
- **Profile-based config**: Project configs support profile overrides via `agentuity.[PROFILE].json` (e.g., `agentuity.production.json`). If the profile-specific file exists and matches the active profile name, it takes precedence over `agentuity.json`

## Code Style

- **Formatter**: Prettier with tabs (width 3), single quotes, semicolons, 100 char line width
- **TypeScript**: Strict mode, ESNext target, bundler moduleResolution, composite project references
- **Linter**: ESLint with TypeScript, React, and JSON support
- **Naming**: Export all public APIs from package `index.ts`, use named exports
- **Build targets**: `react` = browser, `runtime` = bun runtime, `server` = node/bun agnostic

## Special Instructions

- **Documents**: Don't create summary documents UNLESS the user asks you to document it explicitly
- **Clarification**: If you're not 100% sure, ask the user to provide clarification before continuing - especially before making major code changes
