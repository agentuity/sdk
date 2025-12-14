---
name: agentuity-core
description: "Use when: creating structured errors with StructuredError, working with StandardSchemaV1, using InferInput/InferOutput type helpers, or handling validation results."
globs:
  - "**/src/**/*.ts"
---

# Agentuity Core

## StructuredError

Create typed errors with payloads and cause chaining.

```typescript
import { StructuredError, isStructuredError } from '@agentuity/core';

// Basic error
const NotFoundError = StructuredError('NotFoundError');
throw new NotFoundError({ message: 'Resource not found' });

// With typed shape
const ValidationError = StructuredError('ValidationError')<{
  field: string;
  code: string;
}>();
throw new ValidationError({ field: 'email', code: 'INVALID', message: 'Invalid email' });

// With default message (cannot be overridden)
const UpgradeRequired = StructuredError('UpgradeRequired', 'Upgrade required');
throw new UpgradeRequired({ feature: 'advanced' });

// Cause chaining
throw new ValidationError({
  field: 'email',
  code: 'PARSE_ERROR',
  cause: originalError,
});

// Type guard
try {
  riskyOperation();
} catch (err) {
  if (isStructuredError(err)) {
    console.log(err._tag);        // Access error tag
    console.log(err.prettyPrint()); // Formatted output
  }
}
```

**Key points:**
- Properties are directly on instance: `error.field`, not `error.data.field`
- `error._tag` provides runtime type discrimination
- `error.prettyPrint()` formats with cause chain
- JSON serializable

---

## Type Helpers

Extract types from StandardSchemaV1-compatible schemas (Zod, Valibot, @agentuity/schema, etc.).

```typescript
import type { InferInput, InferOutput, StandardSchemaV1 } from '@agentuity/core';
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

type UserInput = InferInput<typeof UserSchema>;   // { name: string; email: string }
type UserOutput = InferOutput<typeof UserSchema>; // { name: string; email: string }

// Generic function with schema types
function processSchema<T extends StandardSchemaV1>(
  schema: T,
  data: InferInput<T>
): InferOutput<T> {
  // Implementation
}
```

**Common mistake:**
```typescript
// ❌ WRONG: Using namespace directly
type MyType = StandardSchemaV1.InferOutput<T>;

// ✅ CORRECT: Use exported helpers
type MyType = InferOutput<T>;
```

---

## Schema Validation

Handle StandardSchemaV1 validation results.

```typescript
// Validation result handling
const result = await schema['~standard'].validate(data);

if ('issues' in result) {
  // FailureResult
  console.log(result.issues[0].message);
} else {
  // SuccessResult
  console.log(result.value);
}
```

---

## Utilities

```typescript
import { safeStringify, toCamelCase, toPascalCase } from '@agentuity/core';

// Safe JSON stringify (handles circular refs, BigInt)
const obj = { self: null }; obj.self = obj;
safeStringify(obj);      // '{"self":"[Circular]"}'
safeStringify(obj, 2);   // Pretty printed

// String utilities
toCamelCase('hello_world');  // 'helloWorld'
toPascalCase('hello_world'); // 'HelloWorld'
```

---

## Reference

- [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)
