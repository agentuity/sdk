# Agent Guidelines for @agentuity/core

## Package Overview

Core utilities and shared types for the Agentuity framework. This package provides foundational types, schemas, error handling, and service interfaces used across all Agentuity packages.

## Commands

- **Build**: `bun run build` (compiles TypeScript with tsc)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `rm -rf dist` (removes build artifacts)

## Architecture

- **Runtime**: Browser and Node/Bun compatible, no runtime-specific code. Must work in all JavaScript environments
- **Build target**: ESNext with TypeScript declaration files
- **Exports**: All public APIs exported from `src/index.ts`
- **No runtime dependencies**: This is a foundational package with zero runtime dependencies

## Structure

```text
src/
├── index.ts              # Main entry point, exports all modules
├── error.ts              # RichError, StructuredError, isStructuredError
├── json.ts               # safeStringify utility
├── logger.ts             # Logger interface and LogLevel type
├── standard_schema.ts    # StandardSchemaV1 interface
├── string.ts             # toCamelCase, toPascalCase utilities
├── typehelper.ts         # InferInput, InferOutput type utilities
├── workbench-config.ts   # Workbench configuration encoding/decoding
└── services/
    ├── _util.ts          # buildUrl, toServiceException, toPayload, fromResponse
    ├── adapter.ts        # FetchAdapter, FetchRequest/Response types
    ├── exception.ts      # ServiceException class
    ├── evalrun.ts        # Eval run event types and schemas
    ├── keyvalue.ts       # KeyValueStorage interface and KeyValueStorageService
    ├── queue.ts          # QueueService interface and QueueStorageService
    ├── sandbox.ts        # Sandbox and Snapshot service interfaces
    ├── session.ts        # Session event types and schemas
    ├── stream.ts         # StreamStorage interface and StreamStorageService
    └── vector.ts         # VectorStorage interface and VectorStorageService
```

## Key Exports

### Error Handling

```typescript
import { RichError, StructuredError, isStructuredError } from '@agentuity/core';

// StructuredError - error with code and metadata
throw new StructuredError('NOT_FOUND', 'User not found', { userId: '123' });

// RichError - error with rich formatting
throw new RichError('Operation failed', { cause: originalError });

// Type guard
if (isStructuredError(error)) {
	console.log(error.code, error.metadata);
}
```

### Type Utilities

```typescript
import type { InferInput, InferOutput, StandardSchemaV1 } from '@agentuity/core';

// Infer schema input/output types (works with Zod, Valibot, ArkType, etc.)
type Input = InferInput<typeof mySchema>;
type Output = InferOutput<typeof mySchema>;
```

### Service Interfaces

```typescript
import {
	KeyValueStorageService,
	VectorStorageService,
	StreamStorageService,
	QueueStorageService,
} from '@agentuity/core';

// All storage services follow the same pattern:
// - Interface defines the contract
// - *Service class provides default implementation with FetchAdapter
```

### String Utilities

```typescript
import { toCamelCase, toPascalCase, safeStringify } from '@agentuity/core';

toCamelCase('hello-world'); // 'helloWorld'
toPascalCase('hello-world'); // 'HelloWorld'
safeStringify(circularObject); // Safe JSON stringification
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
- **Service pattern** - Storage services take a FetchAdapter for HTTP abstraction

## Testing

- When adding tests, use Bun's built-in test runner: `bun test`
- When running tests, prefer using a subagent (Task tool) to avoid context bloat from test output

## Publishing Checklist

1. Run `bun run build` to compile
2. Verify `dist/` contains `.js` and `.d.ts` files
3. Ensure no breaking changes to public APIs
4. This package must be published **first** before other packages (dependency order)
