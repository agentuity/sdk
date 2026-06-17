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
- **Dependencies**: @agentuity/core, @agentuity/sandbox, @agentuity/adapter, zod

## Structure

```text
src/
├── index.ts              # Main exports (core re-export + platform APIs)
├── config.ts             # getServiceUrls, resolveRegion, getAPIBaseURL/etc.
├── logger.ts             # ConsoleLogger, createLogger
├── schema.ts             # toJSONSchema
├── util/resources.ts     # validateResources, validateCPUSpec, validateMemorySpec
└── api/                  # Platform CLI APIs (owned by @agentuity/server)
    ├── user/             # whoami
    ├── org/              # env, list, resources
    ├── project/          # CRUD, deploy, env, malware
    ├── region/           # create, list, delete, resources
    ├── session/          # list, get, logs, events
    ├── thread/           # list, get, delete
    ├── apikey/           # CRUD
    ├── oauth/            # OIDC clients, scopes, flow
    ├── machine/          # machine CRUD
    ├── monitoring/       # monitor nodes, websocket
    ├── storage/          # bucket config, objects
    ├── workflow/         # workflow service
    ├── stats.ts          # getServiceStats
    ├── queue/            # queue admin API (listQueues, messages, DLQ, …)
    ├── stream/           # stream admin API (streamList, delete, …)
    ├── webhook/          # webhook admin API
    └── sandbox/          # @agentuity/sandbox re-export + cliSandboxList
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
