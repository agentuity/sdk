---
name: core-utilities
description: Core utilities for structured errors, schema validation, and type helpers in the Agentuity SDK
globs:
  - "packages/core/src/**/*.ts"
  - "packages/*/src/**/*.ts"
---

# Core Utilities Skills

## Using StructuredError for Failures

### When to Use

- Creating domain-specific error types with typed payloads
- Building errors with cause chaining for debugging
- Implementing runtime type discrimination via `_tag` property
- Generating pretty-printed error output for logs

### Core API

```typescript
import { StructuredError, isStructuredError, RichError } from '@agentuity/core';

// Basic error without shape
const NotFoundError = StructuredError('NotFoundError');
throw new NotFoundError({ message: 'Resource not found' });

// Error with typed shape
const ValidationError = StructuredError('ValidationError')<{
  field: string;
  code: string;
}>();
throw new ValidationError({ field: 'email', code: 'INVALID', message: 'Invalid email' });

// Error with default message (message cannot be overridden)
const UpgradeRequired = StructuredError(
  'UpgradeRequired',
  'Upgrade required to access this feature'
);
throw new UpgradeRequired({ feature: 'advanced' });

// Error with cause chaining
throw new ValidationError({
  field: 'email',
  code: 'PARSE_ERROR',
  cause: originalError,
});

// Type guard for catching errors
try {
  riskyOperation();
} catch (err) {
  if (isStructuredError(err)) {
    console.log(err._tag); // Access the error tag
    console.log(err.prettyPrint()); // Pretty formatted output
  }
}
```

### Key Patterns

```typescript
// Access properties directly on the error instance
const error = new ValidationError({ field: 'name', code: 'REQUIRED' });
error.field;        // 'name' - direct property access
error._tag;         // 'ValidationError'
error.prettyPrint(); // Formatted output with cause chain
JSON.stringify(error); // Serializable with all fields
```

### Common Pitfalls

```typescript
// ❌ WRONG: Accessing via .data property
expect(error.data.field).toBe('name');

// ✅ CORRECT: Properties are directly on the instance
expect(error.field).toBe('name');

// ❌ WRONG: Using generic Error
throw new Error('Validation failed');

// ✅ CORRECT: Use StructuredError with typed payload
throw new ValidationError({ field: 'email', code: 'INVALID' });
```

---

## Using Core Schemas and Validators

### When to Use

- Defining input/output schemas for agents and routes
- Extracting TypeScript types from schema definitions
- Working with any StandardSchemaV1-compatible library (Zod, Valibot, etc.)

### Core API

```typescript
import type { StandardSchemaV1, InferInput, InferOutput } from '@agentuity/core';
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Extract types from any StandardSchemaV1-compatible schema
type UserInput = InferInput<typeof UserSchema>;   // { name: string; email: string }
type UserOutput = InferOutput<typeof UserSchema>; // { name: string; email: string }
```

### Key Patterns

```typescript
// Validation result handling
const result = await schema['~standard'].validate(data);
if ('issues' in result) {
  console.log(result.issues[0].message); // FailureResult
} else {
  console.log(result.value); // SuccessResult
}
```

### Common Pitfalls

```typescript
// ❌ WRONG: Using StandardSchemaV1 namespace directly
import type { StandardSchemaV1 } from '@agentuity/core';
type MyType = StandardSchemaV1.InferOutput<T>;

// ✅ CORRECT: Use exported type helpers
import type { InferInput, InferOutput } from '@agentuity/core';
type MyType = InferOutput<T>;

// ❌ WRONG: Assuming sync validation
const value = schema['~standard'].validate(data).value;

// ✅ CORRECT: Handle async validation
const result = await schema['~standard'].validate(data);
if (!('issues' in result)) {
  const value = result.value;
}
```

---

## Using Core Type Helpers

### When to Use

- Extracting input/output types from StandardSchemaV1 schemas
- Building type-safe agent handlers with proper inference
- Avoiding manual type annotations that defeat inference

### Core API

```typescript
import type { InferInput, InferOutput } from '@agentuity/core';

// InferInput<T> - Extracts input type from StandardSchemaV1 schema
// Returns `never` if T is not a valid schema
type InferInput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<T> : never;

// InferOutput<T> - Extracts output type from StandardSchemaV1 schema
// Returns `void` if T is not a valid schema
type InferOutput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<T> : void;
```

### Key Patterns

```typescript
// Type-safe agent definition
import { z } from 'zod';
import type { InferInput, InferOutput } from '@agentuity/core';

const schema = {
  input: z.object({ name: z.string() }),
  output: z.object({ id: z.string() }),
};

// Let TypeScript infer types from schema
const agent = createAgent('user', {
  schema,
  handler: async (ctx, input) => {
    // input is typed as { name: string }
    return { id: `user-${input.name}` };
  },
});

// Generic function with schema types
function processSchema<T extends StandardSchemaV1>(
  schema: T,
  data: InferInput<T>
): InferOutput<T> {
  // Implementation
}
```

### Common Pitfalls

```typescript
// ❌ WRONG: Adding explicit type annotations defeats inference
handler: async (ctx: AgentContext, input: any) => { ... }

// ✅ CORRECT: Let TypeScript infer from schema
handler: async (ctx, input) => {
  // ctx and input are fully typed from schema
  return { id: `user-${input.name}` };
}

// ❌ WRONG: Manual type definition
interface MyInput {
  name: string;
}

// ✅ CORRECT: Derive from schema
type MyInput = InferInput<typeof mySchema>;
```

---

## Additional Utilities

```typescript
import { safeStringify, toCamelCase, toPascalCase } from '@agentuity/core';

// Safe JSON stringify with circular reference handling
const obj = { self: null }; obj.self = obj;
safeStringify(obj);      // '{"self":"[Circular]"}'
safeStringify(obj, 2);   // Pretty printed
safeStringify({ n: 9007199254740991n }); // BigInt to string

// String utilities
toCamelCase('hello_world');  // 'helloWorld'
toPascalCase('hello_world'); // 'HelloWorld'
```

---

## Reference

See [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference) for complete API documentation.
