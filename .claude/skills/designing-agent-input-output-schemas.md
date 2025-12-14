---
name: designing-agent-input-output-schemas
description: Design patterns for agent input/output schemas - versioning, evolution, validation strategies, and cross-agent communication
globs:
  - "**/agents/**/*.ts"
  - "**/*.agent.ts"
  - "**/schema*.ts"
---

# Designing Agent Input/Output Schemas

## When to Use
- Designing new agent interfaces
- Evolving existing schemas without breaking clients
- Coordinating schemas across multiple agents
- Optimizing for type inference and validation

## Schema Design Principles

### 1. Prefer Explicit Over Implicit

```typescript
// ✅ GOOD: Explicit fields with clear types
const InputSchema = s.object({
  userId: s.string().describe('User identifier'),
  action: s.enum(['create', 'update', 'delete']),
  payload: s.object({
    name: s.string(),
    email: s.string().optional(),
  }),
});

// ❌ BAD: Loose typing loses validation benefits
const InputSchema = s.object({
  data: s.any(), // No validation, no type safety
});
```

### 2. Use Descriptive Field Names

```typescript
// ✅ GOOD: Self-documenting
const OrderSchema = s.object({
  customerId: s.string(),
  lineItems: s.array(LineItemSchema),
  shippingAddress: AddressSchema,
});

// ❌ BAD: Cryptic abbreviations
const OrderSchema = s.object({
  cid: s.string(),
  li: s.array(LineItemSchema),
  addr: AddressSchema,
});
```

### 3. Design for Evolution

```typescript
// ✅ GOOD: Optional fields for new features
const UserInputV1 = s.object({
  name: s.string(),
  email: s.string(),
});

// V2 adds optional fields (backward compatible)
const UserInputV2 = s.object({
  name: s.string(),
  email: s.string(),
  phone: s.string().optional(),  // New in V2
  preferences: PreferencesSchema.optional(),  // New in V2
});
```

## Schema Composition Patterns

### Shared Base Schemas

```typescript
// schemas/common.ts
export const TimestampFields = s.object({
  createdAt: s.string(),
  updatedAt: s.string(),
});

export const PaginationInput = s.object({
  page: s.number().optional(),
  limit: s.number().optional(),
});

// agents/user.agent.ts
import { TimestampFields } from '../schemas/common';

const UserSchema = s.object({
  id: s.string(),
  name: s.string(),
  ...TimestampFields.shape, // Spread shared fields
});
```

### Request/Response Envelopes

```typescript
// Standard response wrapper for consistency
const ResponseEnvelope = <T extends StandardSchemaV1>(dataSchema: T) =>
  s.object({
    success: s.boolean(),
    data: dataSchema.optional(),
    error: s.object({
      code: s.string(),
      message: s.string(),
    }).optional(),
  });

// Usage
const UserResponseSchema = ResponseEnvelope(UserSchema);
```

## Cross-Agent Communication

### Type-Safe Agent Calls

```typescript
// agents/order.agent.ts
import userAgent from './user.agent';
import inventoryAgent from './inventory.agent';

export default createAgent('order', {
  schema: {
    input: s.object({ userId: s.string(), productId: s.string() }),
    output: s.object({ orderId: s.string(), status: s.string() }),
  },
  handler: async (ctx, input) => {
    // Type-safe: userAgent.run expects { userId: string }
    const user = await userAgent.run({ userId: input.userId });
    
    // Type-safe: inventoryAgent.run expects { productId: string }
    const inventory = await inventoryAgent.run({ productId: input.productId });
    
    return { orderId: generateId(), status: 'created' };
  },
});
```

## Common Pitfalls

1. **Over-validating** - Don't add validation for fields you don't use
2. **Under-describing** - Always add `.describe()` for complex fields
3. **Breaking changes** - Never remove required fields, only make them optional
4. **Circular imports** - Put shared schemas in dedicated files

## Checklist

- [ ] All required fields are truly required
- [ ] Optional fields have sensible defaults in handler
- [ ] Enums use literal values, not magic strings
- [ ] Complex objects have descriptions
- [ ] Shared schemas are in `schemas/` directory
- [ ] No circular dependencies between agent schemas

## See Also

- [SDK Reference](https://preview.agentuity.dev/v1/Reference/sdk-reference)
- `defining-agents-with-create-agent` for agent definition
- `defining-schemas-with-agentuity-schema` for schema API
