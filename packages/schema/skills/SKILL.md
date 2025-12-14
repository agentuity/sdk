# @agentuity/schema Skills

---
name: agentuity-schema-skills
description: Lightweight schema validation library with StandardSchema v1 support for type-safe runtime validation
globs:
  - "packages/schema/**/*.ts"
  - "**/schema*.ts"
---

## Defining Schemas with @agentuity/schema

### When to Use

Use `@agentuity/schema` when you need lightweight, type-safe runtime validation without heavy dependencies. Ideal for validating API inputs, configuration objects, and agent schemas in the Agentuity platform.

### Core API

```typescript
import { s } from '@agentuity/schema';

// Primitives
const nameSchema = s.string();
const ageSchema = s.number();
const activeSchema = s.boolean();

// String with constraints
const emailSchema = s.string().email();
const urlSchema = s.string().url();
const usernameSchema = s.string().min(3).max(20);

// Objects
const userSchema = s.object({
  name: s.string(),
  age: s.number(),
  email: s.string().email().optional(),
});

// Arrays
const tagsSchema = s.array(s.string());
const usersSchema = s.array(userSchema);

// Enums (union of literals)
const roleSchema = s.enum(['admin', 'user', 'guest']);

// Union types
const idSchema = s.union(s.string(), s.number());

// Literals
const statusSchema = s.literal('active');

// Optional and nullable
const optionalName = s.optional(s.string());
const nullableName = s.nullable(s.string());
// Or use method chaining:
const optionalAge = s.number().optional();
const nullableAge = s.number().nullable();

// Records (string keys with typed values)
const metadata = s.record(s.string());

// Type extraction
type User = s.infer<typeof userSchema>;
```

### Key Patterns

- Import `s` as the main builder: `import { s } from '@agentuity/schema'`
- Use `s.infer<typeof schema>` to extract TypeScript types
- Chain `.describe()` to add documentation for JSON Schema export
- All schemas implement StandardSchemaV1 for interoperability

### Common Pitfalls

- **Don't use `s.null` or `s.undefined` directly** - use `s.nullable()` or `s.optional()` wrappers
- **Remember `s.enum()` takes an array** - `s.enum(['a', 'b'])` not `s.enum('a', 'b')`
- **Type inference requires `typeof`** - `s.infer<typeof schema>` not `s.infer<schema>`

---

## Validating and Parsing Data

### When to Use

Use `parse()` when you want exceptions on invalid data. Use `safeParse()` when you need to handle errors gracefully without try/catch.

### Core API

```typescript
import { s, ValidationError } from '@agentuity/schema';

const userSchema = s.object({
  name: s.string(),
  age: s.number(),
});

// parse() - throws on failure
try {
  const user = userSchema.parse(data);
  console.log(user.name); // Fully typed
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.message);  // Human-readable error
    console.log(error.issues);   // Array of ValidationIssue
  }
}

// safeParse() - returns result object
const result = userSchema.safeParse(data);

if (result.success) {
  console.log(result.data); // Typed as User
} else {
  console.log(result.error.message);
  result.error.issues.forEach((issue) => {
    console.log(`${issue.path?.join('.')}: ${issue.message}`);
  });
}
```

### ValidationError Structure

```typescript
interface ValidationIssue {
  message: string;
  path?: ReadonlyArray<PropertyKey>;
}

interface SafeParseSuccess<T> {
  success: true;
  data: T;
}

interface SafeParseError {
  success: false;
  error: ValidationError;
}
```

### Key Patterns

- Use `safeParse()` for user input where errors are expected
- Use `parse()` for internal data that should always be valid
- Access `error.issues` to get structured validation errors with paths
- Path segments show nested field locations: `['user', 'address', 'city']`

### Common Pitfalls

- **Async validation is not supported** - `parse()` and `safeParse()` are synchronous only
- **Don't catch generic `Error`** - check for `instanceof ValidationError` specifically
- **SafeParse result requires narrowing** - check `result.success` before accessing `data`

---

## Composing and Reusing Schemas

### When to Use

When building complex schemas from simpler ones, sharing schemas across files, or when you need to transform schemas (optional, nullable, described).

### Core API

```typescript
import { s, type Infer } from '@agentuity/schema';

// Base schema definition
const addressSchema = s.object({
  street: s.string(),
  city: s.string(),
  zip: s.string().min(5).max(10),
});

// Compose into larger schemas
const userSchema = s.object({
  name: s.string(),
  email: s.string().email(),
  address: addressSchema,
  shippingAddress: addressSchema.optional(),
});

// Export types alongside schemas
export type Address = s.infer<typeof addressSchema>;
export type User = s.infer<typeof userSchema>;

// Add descriptions for documentation/JSON Schema
const documentedSchema = s.object({
  id: s.string().describe('Unique identifier'),
  name: s.string().describe('Display name'),
}).describe('User profile object');

// Convert to JSON Schema for OpenAPI/docs
import { toJSONSchema } from '@agentuity/schema';
const jsonSchema = toJSONSchema(userSchema);

// Create from JSON Schema
import { fromJSONSchema } from '@agentuity/schema';
const schemaFromJson = fromJSONSchema({
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
});
```

### Sharing Schemas Across Files

```typescript
// schemas/common.ts
export const idSchema = s.string().min(1).describe('Entity ID');
export const timestampSchema = s.number().describe('Unix timestamp');

// schemas/user.ts
import { idSchema } from './common';

export const userSchema = s.object({
  id: idSchema,
  name: s.string(),
  managerId: idSchema.optional(),
});
export type User = s.infer<typeof userSchema>;
```

### Coercion for Type Conversion

```typescript
// Coerce values to target types (useful for form data/query params)
const ageSchema = s.coerce.number();   // Number("42") -> 42
const nameSchema = s.coerce.string();  // String(123) -> "123"
const flagSchema = s.coerce.boolean(); // Boolean(1) -> true
const dateSchema = s.coerce.date();    // new Date("2024-01-01")
```

### Key Patterns

- Export schemas and their inferred types together
- Use `.describe()` for self-documenting schemas
- Leverage `toJSONSchema()` for OpenAPI integration
- Use coercion schemas for string-based inputs (forms, query params)

### Common Pitfalls

- **Object spread happens at definition time** - you can't dynamically extend schemas
- **Coercion uses JavaScript type constructors** - `Number("")` returns `0`, not NaN
- **JSON Schema conversion is one-way for complex schemas** - some features may not round-trip

---

## Reference

For complete API documentation, see the [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference).
