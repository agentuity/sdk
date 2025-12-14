---
name: agentuity-schema
description: "Use when: defining schemas with s.object/string/number, validating with parse/safeParse, composing schemas, or converting to JSON Schema."
globs:
  - "**/schema*.ts"
  - "**/*.schema.ts"
---

# @agentuity/schema

Lightweight schema validation with StandardSchemaV1 support.

## Defining Schemas

```typescript
import { s } from '@agentuity/schema';

// Primitives
const name = s.string();
const age = s.number();
const active = s.boolean();

// String constraints
const email = s.string().email();
const url = s.string().url();
const username = s.string().min(3).max(20);

// Objects
const userSchema = s.object({
  name: s.string(),
  age: s.number(),
  email: s.string().email().optional(),
});

// Arrays
const tags = s.array(s.string());
const users = s.array(userSchema);

// Enums (array of literals)
const role = s.enum(['admin', 'user', 'guest']);

// Union
const id = s.union(s.string(), s.number());

// Literal
const status = s.literal('active');

// Optional/Nullable
const optionalName = s.string().optional();
const nullableName = s.string().nullable();

// Records
const metadata = s.record(s.string());

// Type extraction
type User = s.infer<typeof userSchema>;
```

---

## Validation

```typescript
import { s, ValidationError } from '@agentuity/schema';

const userSchema = s.object({
  name: s.string(),
  age: s.number(),
});

// parse() - throws on failure
try {
  const user = userSchema.parse(data);
  console.log(user.name);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.message);
    console.log(error.issues);  // Array of ValidationIssue
  }
}

// safeParse() - returns result object
const result = userSchema.safeParse(data);

if (result.success) {
  console.log(result.data);
} else {
  result.error.issues.forEach((issue) => {
    console.log(`${issue.path?.join('.')}: ${issue.message}`);
  });
}
```

**Key points:**
- `parse()` throws, `safeParse()` returns result object
- Check `result.success` before accessing `result.data`
- Issues include `path` for nested field locations

---

## Coercion

Convert string inputs to target types (useful for forms/query params).

```typescript
const age = s.coerce.number();   // Number("42") → 42
const name = s.coerce.string();  // String(123) → "123"
const flag = s.coerce.boolean(); // Boolean(1) → true
const date = s.coerce.date();    // new Date("2024-01-01")
```

---

## Composition

```typescript
// Shared schemas
const addressSchema = s.object({
  street: s.string(),
  city: s.string(),
  zip: s.string().min(5).max(10),
});

const userSchema = s.object({
  name: s.string(),
  address: addressSchema,
  shippingAddress: addressSchema.optional(),
});

// Descriptions for docs/AI
const documentedSchema = s.object({
  id: s.string().describe('Unique identifier'),
  name: s.string().describe('Display name'),
}).describe('User profile object');
```

---

## JSON Schema Conversion

```typescript
import { toJSONSchema, fromJSONSchema } from '@agentuity/schema';

// Export to JSON Schema
const jsonSchema = toJSONSchema(userSchema);

// Import from JSON Schema
const schema = fromJSONSchema({
  type: 'object',
  properties: { name: { type: 'string' } },
});
```

---

## Common Mistakes

```typescript
// ❌ s.enum takes array, not multiple args
s.enum('a', 'b');

// ✅ Correct
s.enum(['a', 'b']);

// ❌ Type inference needs typeof
s.infer<schema>;

// ✅ Correct
s.infer<typeof schema>;

// ❌ .describe() at wrong position
s.string().describe('Name').min(1);  // min() loses description

// ✅ .describe() at end
s.string().min(1).describe('Name');
```

---

## Reference

- [Schema Libraries](https://preview.agentuity.dev/v1/Build/Agents/schema-libraries)
- [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)
