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
├── index.ts              # Main entry point, exports all schemas and `s` builder
├── base.ts               # Base schema class, types (Schema, Infer, ValidationError)
├── json-schema.ts        # toJSONSchema, fromJSONSchema conversion utilities
├── primitives/           # Primitive type schemas
│   ├── string.ts         # StringSchema, string()
│   ├── number.ts         # NumberSchema, number()
│   ├── boolean.ts        # BooleanSchema, boolean()
│   ├── null.ts           # NullSchema, null_()
│   ├── undefined.ts      # UndefinedSchema, undefined_()
│   ├── unknown.ts        # UnknownSchema, unknown()
│   └── any.ts            # AnySchema, any()
├── complex/              # Complex type schemas
│   ├── object.ts         # ObjectSchema, object()
│   ├── array.ts          # ArraySchema, array()
│   └── record.ts         # RecordSchema, record()
├── utils/                # Utility schemas
│   ├── optional.ts       # OptionalSchema, optional()
│   ├── nullable.ts       # NullableSchema, nullable()
│   ├── union.ts          # UnionSchema, union()
│   └── literal.ts        # LiteralSchema, literal()
└── coerce/               # Type coercion schemas
    ├── string.ts         # CoerceStringSchema, coerceString()
    ├── number.ts         # CoerceNumberSchema, coerceNumber()
    ├── boolean.ts        # CoerceBooleanSchema, coerceBoolean()
    └── date.ts           # CoerceDateSchema, coerceDate()
```

## Key Exports

### Schema Builder (`s`)

```typescript
import { s } from '@agentuity/schema';

// Define schemas
const UserSchema = s.object({
	name: s.string(),
	age: s.number(),
	role: s.enum(['admin', 'user', 'guest']),
	email: s.optional(s.string()),
});

// Extract TypeScript type from schema
type User = s.infer<typeof UserSchema>;

// Parse/validate data
const user = UserSchema.parse(data); // throws on invalid
const result = UserSchema.safeParse(data); // returns { success, data/issues }
```

**Note on `s.enum`:** Implemented as `enumSchema()` in `index.ts`, it's a thin wrapper around `union()` and `literal()`. Example: `s.enum(['a', 'b'])` is equivalent to `s.union(s.literal('a'), s.literal('b'))`.

### Individual Schema Exports

```typescript
import {
	// Primitives
	string,
	number,
	boolean,
	null_,
	undefined_,
	unknown,
	any,
	// Complex
	object,
	array,
	record,
	// Utils
	literal,
	optional,
	nullable,
	union,
	// Coercion
	coerceString,
	coerceNumber,
	coerceBoolean,
	coerceDate,
	// JSON Schema
	toJSONSchema,
	fromJSONSchema,
	// Types
	type Schema,
	type Infer,
	type ValidationError,
} from '@agentuity/schema';
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
- Support type inference via `s.infer<T>` utility type

## Testing

- **Test Framework**: Bun's built-in test runner
- **Command**: `bun test` (run from package directory)
- **Coverage**: Primitives, complex types, utilities, coercion, type inference, JSON Schema, error handling
- All tests must pass before merging
- When running tests, prefer using a subagent (Task tool) to avoid context bloat from test output

## Publishing Checklist

1. Run `bun run build` to compile
2. Verify `dist/` contains `.js` and `.d.ts` files
3. Ensure StandardSchema compliance
4. This package depends on `@agentuity/core` (must be published first)
