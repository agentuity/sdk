# Agent Guidelines for @agentuity/server

## Package Overview

Runtime-agnostic server utilities for Node.js and Bun applications. This package provides common server-side utilities that work across both runtimes without using runtime-specific APIs.

## Commands

- **Build**: `bun run build` (compiles TypeScript with tsc)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `rm -rf dist` (removes build artifacts)

## Architecture

- **Runtime**: Node.js and Bun compatible (no runtime-specific code)
- **Build target**: ESNext with TypeScript declaration files
- **Exports**: All public APIs exported from `src/index.ts`
- **Dependencies**: Only @agentuity/core and standard Node.js types

## Structure

```text
src/
├── index.ts              # Main entry point, exports all modules
├── config.ts             # Service URL configuration: ServiceUrls, getServiceUrls
└── server.ts             # Server fetch adapter: createServerFetchAdapter
```

## Code Style

- **Runtime agnostic** - No Bun-specific or Node-specific APIs
- **TypeScript-first** - All code is TypeScript
- **Interface-based** - Prefer interfaces for public APIs
- **Server-side only** - Not browser compatible
- **Minimal dependencies** - Keep dependencies lean

## Important Conventions

- **No runtime-specific code** - Must work in both Node.js and Bun
- **No browser APIs** - Server-side only
- **Shared with runtime** - Common utilities used by @agentuity/runtime
- **Breaking changes** - Coordinate with @agentuity/runtime package
- **Standard patterns** - Follow Node.js/Bun common practices

## Testing

- Use Bun's built-in test runner: `bun test`
- Test with both Node.js and Bun when possible
- Avoid runtime-specific test utilities
- When running tests, prefer using a subagent (Task tool) to avoid context bloat from test output

## Publishing Checklist

1. Run `bun run build` to compile
2. Verify `dist/` contains `.js` and `.d.ts` files
3. Ensure no runtime-specific APIs are used
4. Test with both Node.js and Bun if possible
5. Must be published **after** @agentuity/core
