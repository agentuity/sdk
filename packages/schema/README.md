# @agentuity/schema

A lightweight, type-safe schema validation library for the Agentuity platform. Supports the [StandardSchema](https://standardschema.dev/) specification.

## Features

- 🎯 Type-safe schema validation
- 📦 Lightweight with zero runtime dependencies
- 🔗 StandardSchema v1 compliant
- 🌐 Works in browser and server environments (Node.js, Bun)
- ⚡ Simple, fluent API

## Installation

```bash
bun add @agentuity/schema
```

## Usage

```typescript
import { s, ValidationError } from '@agentuity/schema';

// Define a schema
const userSchema = s.object({
	name: s.string(),
	age: s.number(),
	email: s.string(),
	isActive: s.boolean(),
});

// Extract the inferred type (like zod's z.infer)
type User = s.infer<typeof userSchema>;

// Parse with validation (throws on error)
try {
	const user: User = userSchema.parse({
		name: 'John',
		age: 30,
		email: 'john@example.com',
		isActive: true,
	});
	console.log('Valid user:', user);
} catch (error) {
	if (error instanceof ValidationError) {
		console.error('Validation failed:', error.message);
		console.error('Issues:', error.issues);
	}
}

// Safe parse (returns result object)
const result = userSchema.safeParse(data);
if (result.success) {
	console.log('Valid data:', result.data);
} else {
	console.error('Validation failed:', result.error.message);
}

// Optional and nullable
const optionalSchema = s.object({
	name: s.string(),
	nickname: s.optional(s.string()),
	age: s.nullable(s.number()),
});

// Arrays
const stringArraySchema = s.array(s.string());
const userArraySchema = s.array(userSchema);

// Unions
const statusSchema = s.union(s.literal('active'), s.literal('inactive'), s.literal('pending'));

// Enums (shorthand for union of literals)
const roleSchema = s.enum(['admin', 'user', 'guest']);
const prioritySchema = s.enum([1, 2, 3, 4, 5]);

// Literal values
const roleSchema = s.literal('admin');
```

## API

### Basic Types

- `s.string()` - String validation
- `s.number()` - Number validation
- `s.boolean()` - Boolean validation
- `s.null()` - Null validation
- `s.undefined()` - Undefined validation

### Complex Types

- `s.object(shape)` - Object validation with typed properties
- `s.array(schema)` - Array validation with typed elements

### Utility Types

- `s.optional(schema)` - Makes a schema optional
- `s.nullable(schema)` - Makes a schema nullable
- `s.union(...schemas)` - Union of multiple schemas
- `s.literal(value)` - Exact value matching
- `s.enum([...values])` - Enum type (union of literals)

```typescript
// Enum (shorthand for union of literals)
const roleSchema = s.enum(['admin', 'user', 'guest']);
const role = roleSchema.parse('admin'); // 'admin'

// Equivalent to:
const roleSchema2 = s.union(s.literal('admin'), s.literal('user'), s.literal('guest'));
```

### Coercion

Automatically convert values to the correct type (like zod.coerce):

- `s.coerce.string()` - Coerce to string using `String(value)`
- `s.coerce.number()` - Coerce to number using `Number(value)`
- `s.coerce.boolean()` - Coerce to boolean using `Boolean(value)`
- `s.coerce.date()` - Coerce to Date using `new Date(value)`

```typescript
// Parse form data where everything is a string
const formSchema = s.object({
	name: s.string(),
	age: s.coerce.number(), // "30" → 30
	newsletter: s.coerce.boolean(), // "on" → true
	createdAt: s.coerce.date(), // "2025-01-01" → Date
});

const formData = formSchema.parse({
	name: 'John',
	age: '30', // String coerced to number
	newsletter: 'on', // String coerced to boolean
	createdAt: '2025-01-01', // String coerced to Date
});

// Query parameters (always strings)
const querySchema = s.object({
	page: s.coerce.number(),
	limit: s.coerce.number(),
});

const params = querySchema.parse({
	page: '1', // "1" → 1
	limit: '20', // "20" → 20
});
```

### Documentation

All schemas support a `.describe(description: string)` method for adding documentation:

```typescript
const userSchema = s
	.object({
		id: s.string().describe('The unique identifier'),
		name: s.string().describe('The user full name'),
		age: s.number().describe('Age in years'),
	})
	.describe('User profile');
```

### JSON Schema Conversion

Convert schemas to JSON Schema format:

```typescript
const schema = s.object({
	name: s.string().describe('User name'),
	age: s.number().describe('User age'),
});

const jsonSchema = s.toJSONSchema(schema);
// {
//   "type": "object",
//   "properties": {
//     "name": { "type": "string", "description": "User name" },
//     "age": { "type": "number", "description": "User age" }
//   },
//   "required": ["name", "age"]
// }
```

Convert JSON Schema to schemas:

```typescript
const jsonSchema = {
	type: 'object',
	properties: {
		firstName: {
			type: 'string',
			description: 'First name',
		},
		lastName: {
			type: 'string',
			description: 'Last name',
		},
		age: {
			type: 'number',
			description: 'Age',
		},
		hobbies: {
			type: 'array',
			items: { type: 'string' },
		},
	},
	required: ['firstName', 'lastName', 'age', 'hobbies'],
};

const schema = s.fromJSONSchema(jsonSchema);
// Now you can use schema for validation
const result = schema['~standard'].validate(data);
```

Round-trip conversion is supported:

```typescript
const original = s.object({ name: s.string() });
const json = s.toJSONSchema(original);
const reconstructed = s.fromJSONSchema(json);
// reconstructed works exactly like original
```

### Parsing & Validation

#### `.parse(value)` - Throws on validation error

```typescript
try {
	const user = userSchema.parse(data);
	// user is typed and validated
} catch (error) {
	if (error instanceof ValidationError) {
		console.error(error.message); // Human-readable error
		console.error(error.issues); // Detailed issue array with paths
	}
}
```

#### `.safeParse(value)` - Returns result object

```typescript
const result = userSchema.safeParse(data);

if (result.success) {
	console.log(result.data); // Typed data
} else {
	console.error(result.error); // ValidationError instance
}
```

### Type Inference

Use `s.infer` to extract TypeScript types from schemas (like zod's `z.infer`):

```typescript
import { s } from '@agentuity/schema';

const Player = s.object({
	username: s.string(),
	xp: s.number(),
	inventory: s.array(s.string()),
});

// Extract the inferred type (like zod's z.infer)
type Player = s.infer<typeof Player>;
// { username: string; xp: number; inventory: string[] }

const player: Player = Player.parse(data);
```

You can also import the `Infer` type directly if preferred:

```typescript
import { s, type Infer } from '@agentuity/schema';

type Player = Infer<typeof Player>; // Alternative syntax
```

### Error Handling

Validation errors are structured and include paths to the failed fields:

```typescript
const profileSchema = s.object({
	user: s.object({
		name: s.string(),
		age: s.number(),
	}),
});

try {
	profileSchema.parse({ user: { name: 'John', age: 'thirty' } });
} catch (error) {
	if (error instanceof ValidationError) {
		console.log(error.message);
		// "[user.age]: Expected number, got string"

		console.log(error.issues);
		// [{ message: "Expected number, got string", path: ["user", "age"] }]
	}
}
```

## StandardSchema Support

All schemas implement the StandardSchema v1 interface:

```typescript
interface StandardSchemaV1<Input, Output> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (value: unknown) => Result<Output>;
		readonly types?: { input: Input; output: Output };
	};
}
```

## License

Apache-2.0
