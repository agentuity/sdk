# Agent Guidelines for @agentuity/core

## Package Overview

Core utilities and shared types for the Agentuity framework. This package provides foundational types, schemas, and utilities used across all Agentuity packages.

## Commands

- **Build**: `bun run build` (compiles TypeScript with tsc)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `rm -rf dist` (removes build artifacts)

## Architecture

- **Runtime**: Browser and Node/Bun compatible, no runtime-specific code. Must work in all JavaScript environments
- **Build target**: ESNext with TypeScript declaration files
- **Exports**: All public APIs exported from `src/index.ts`
- **No dependencies**: This is a foundational package with zero runtime dependencies

## Structure

```text
src/
├── index.ts              # Main entry point, exports all modules
├── json.ts               # JSON utilities
├── standard_schema.ts    # Standard schema interfaces
├── typehelper.ts         # TypeScript utility types
└── services/             # Storage service interfaces
```

## Code Style

- **No runtime dependencies** - Keep this package lean
- **TypeScript-first** - All code is TypeScript
- **Interface-based** - Prefer interfaces for public APIs
- **Generic types** - Use generics for reusable type utilities
- **No framework coupling** - Must work in any JavaScript environment

## Important Conventions

- **Breaking changes** - This package is used by all other packages, so breaking changes affect everything
- **Type-only exports** - Many exports are `type` or `interface` only
- **Standard Schema compatibility** - Follow StandardSchemaV1 spec for validation interfaces
- **No side effects** - All exports must be pure (no global mutations)

## Testing

- No test framework configured yet
- When adding tests, use Bun's built-in test runner: `bun test`
- When running tests, prefer using a subagent (Task tool) to avoid context bloat from test output

## Publishing Checklist

1. Run `bun run build` to compile
2. Verify `dist/` contains `.js` and `.d.ts` files
3. Ensure no breaking changes to public APIs
4. This package must be published **first** before other packages (dependency order)
