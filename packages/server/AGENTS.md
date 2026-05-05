# Agent Guidelines for @agentuity/server

## Package Overview

Server-side utilities for Node.js and Bun applications. Provides API clients for Agentuity cloud services, configuration, logging, and resource validation.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: All public APIs from `src/index.ts`
- **Dependencies**: @agentuity/core, zod

## Structure

```text
src/
├── index.ts              # Main exports
├── config.ts             # getServiceUrls, resolveRegion, getAPIBaseURL/etc.
├── logger.ts             # ConsoleLogger, createLogger
├── schema.ts             # toJSONSchema
├── runtime-bootstrap.ts  # bootstrapRuntimeEnv (legacy helper, no callers in v3)
├── util/resources.ts     # validateResources, validateCPUSpec, validateMemorySpec
└── api/                  # API clients for Agentuity cloud services
    ├── org/              # Organization management
    ├── project/          # Project management (deploy, env, etc.)
    ├── region/           # Region management
    ├── sandbox/          # Sandbox management (create, execute, files, snapshot)
    └── user/             # User operations (whoami)
```

## Code Conventions

- **TypeScript-first** - All code is TypeScript
- **Zod schemas** - Use zod for runtime validation
- **CLI-facing** - These utilities are consumed primarily by `@agentuity/cli`. They are not intended for use in deployed user code.
- **Re-exports** - `@agentuity/core` types and `z` from zod
- **Import extensions** - Always use `.ts` extensions in relative imports (e.g., `from '../api.ts'`, not `from '../api'`). This is required for Node.js ESM compatibility — `tsc` rewrites `.ts` → `.js` in compiled output, but leaves extensionless imports untouched, which breaks Node.js module resolution. This is enforced by the `useImportExtensions` Biome lint rule.

## Key Exports

- **Adapter**: `createServerFetchAdapter`
- **Config**: `getServiceUrls`, `resolveRegion`
- **Logging**: `createLogger`, `ConsoleLogger`
- **Validation**: `validateResources`, `validateCPUSpec`, `validateMemorySpec`
- **API Clients**: All functions from `api/*` (listProjects, createSandbox, etc.)

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core
