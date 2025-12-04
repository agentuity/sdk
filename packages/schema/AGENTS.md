# Agent Guidelines for @agentuity/schema

## Package Overview

Lightweight schema validation library with StandardSchema v1 support. Provides type-safe runtime validation for the Agentuity platform.

## Commands

- **Build**: `bun run build` (compiles TypeScript with tsc)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `rm -rf dist` (removes build artifacts)

## Architecture

- **Runtime**: Node/Bun/Browser compatible, no runtime-specific code
- **Build target**: ESNext with TypeScript declaration files
- **Exports**: All public APIs exported from `src/index.ts`
- **Dependencies**: Only depends on `@agentuity/core` for StandardSchema types

## Structure

```text
src/
├── index.ts              # Main entry point, exports all schemas
├── base.ts               # Base schema class and types
├── primitives/           # Primitive type schemas
│   ├── string.ts
│   ├── number.ts
│   ├── boolean.ts
│   ├── null.ts
│   └── undefined.ts
├── complex/              # Complex type schemas
│   ├── object.ts
│   └── array.ts
├── utils/                # Utility schemas
│   ├── optional.ts
│   ├── nullable.ts
│   ├── union.ts
│   └── literal.ts
├── coerce/               # Type coercion schemas
│   ├── string.ts
│   ├── number.ts
│   ├── boolean.ts
│   └── date.ts
├── json-schema.ts        # JSON Schema conversion utilities
└── __tests__/            # Bun unit tests
    ├── primitives.test.ts
    ├── complex.test.ts
    ├── utils.test.ts
    ├── coerce.test.ts
    ├── type-inference.test.ts
    ├── json-schema.test.ts
    └── errors.test.ts
```

## Code Style

- **StandardSchema compliant** - All schemas implement StandardSchemaV1
- **Fluent API** - Chainable methods where appropriate
- **Type-safe** - Full TypeScript support with type inference
- **Vendor name**: "agentuity" for all schemas
- **No side effects** - Pure validation functions

## Important Conventions

- All schemas must implement `StandardSchemaV1` from `@agentuity/core`
- Use `'~standard'` property for StandardSchema interface
- Export main builder as `s` (e.g., `s.string()`, `s.object()`)
- Error messages should be clear and actionable
- Support type inference via `Infer<T>` utility type

## Testing

- **Test Framework**: Bun's built-in test runner
- **Test Count**: 72 tests across 7 test files
- **Command**: `bun test` (run from package directory)
- **Coverage**: Primitives, complex types, utilities, coercion, type inference, JSON Schema, error handling
- **CI**: Tests run automatically on PR builds
- All tests must pass before merging

## Publishing Checklist

1. Run `bun run build` to compile
2. Verify `dist/` contains `.js` and `.d.ts` files
3. Ensure StandardSchema compliance
4. This package depends on `@agentuity/core` (must be published first)
