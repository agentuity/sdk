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
├── config.ts             # getServiceUrls, resolveRegion
├── server.ts             # createServerFetchAdapter
├── logger.ts             # ConsoleLogger, createLogger
├── schema.ts             # toJSONSchema
├── runtime-bootstrap.ts  # bootstrapRuntimeEnv
├── util/resources.ts     # validateResources, validateCPUSpec, validateMemorySpec
└── api/                  # API clients for Agentuity cloud services
    ├── apikey/           # API key management
    ├── db/               # Database operations
    ├── eval/             # Eval management
    ├── org/              # Organization management
    ├── project/          # Project management (deploy, env, etc.)
    ├── queue/            # Queue management
    ├── region/           # Region management
    ├── sandbox/          # Sandbox management (create, execute, files, snapshot)
    ├── session/          # Session logs
    ├── thread/           # Thread management
    ├── usage/            # Usage & spending tracking
    └── user/             # User operations (whoami)
```

## Code Conventions

- **TypeScript-first** - All code is TypeScript
- **Zod schemas** - Use zod for runtime validation
- **Shared with runtime** - Common utilities used by @agentuity/runtime
- **Re-exports** - `@agentuity/core` types and `z` from zod

## Key Exports

- **Adapter**: `createServerFetchAdapter`
- **Config**: `getServiceUrls`, `resolveRegion`
- **Logging**: `createLogger`, `ConsoleLogger`
- **Validation**: `validateResources`, `validateCPUSpec`, `validateMemorySpec`
- **API Clients**: All functions from `api/*` (listProjects, createSandbox, getUsageSummary, etc.)

## Key APIs by Module

### Usage & Spending Tracking

- **Zero-config**: `getUsageSummary()`, `getUsageBreakdown()`, `getUsageTimeseries()`
- Auto-resolves API client and project ID from environment when running in Agentuity
- Provides cost metrics, token usage, and session counts
- Supports time-series data, grouping by agent/deployment/day/hour

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core
