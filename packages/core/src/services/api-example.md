# APIClient Usage Examples

The `APIClient` has a friendly interface with built-in Zod schema validation.

## Public API (no authentication)

```typescript
import { APIClient, createLogger } from '@agentuity/server';

const logger = createLogger('info');

// Simple - just URL, logger, and optional config
const client = new APIClient('https://api.agentuity.com', logger);

// With config
const client = new APIClient('https://api.agentuity.com', logger, {
	skipVersionCheck: true,
	userAgent: 'MyApp/1.0.0',
});
```

## Authenticated API

```typescript
import { APIClient, createLogger } from '@agentuity/server';

const logger = createLogger('info');
const apiKey = 'your-api-key';

// With API key
const client = new APIClient('https://api.agentuity.com', logger, apiKey);

// With API key and config
const client = new APIClient('https://api.agentuity.com', logger, apiKey, {
	skipVersionCheck: true,
	userAgent: 'MyApp/1.0.0',
});
```

## Making Requests

Use the HTTP verb methods (recommended) or the generic `request()` method:

```typescript
import { APIClient, z, ValidationError } from '@agentuity/server';

// Define schemas
const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().email(),
});

const CreateUserSchema = z.object({
	name: z.string(),
	email: z.string().email(),
});

const logger = createLogger('info');
const client = new APIClient('https://api.agentuity.com', logger, apiKey);

// GET request with response validation (recommended)
try {
	const user = await client.get('/users/123', UserSchema);
	console.log(user.name); // Fully typed!
} catch (error) {
	if (error instanceof ValidationError) {
		console.error('Validation failed:', error.issues);
	}
}

// POST request with request and response validation (recommended)
const newUser = await client.post(
	'/users',
	{
		// request body
		name: 'John Doe',
		email: 'john@example.com',
	},
	UserSchema, // response schema (optional)
	CreateUserSchema // request body schema (optional)
);

// PUT request
const updatedUser = await client.put('/users/123', { name: 'Jane Doe' }, UserSchema);

// DELETE request
await client.delete('/users/123');

// PATCH request
const patchedUser = await client.patch('/users/123', { email: 'newemail@example.com' }, UserSchema);
```

## API Response Wrapper Pattern

For APIs that wrap responses in a standard format:

```typescript
import { z } from '@agentuity/server';

// Generic wrapper schema
const APIResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
	z.object({
		success: z.boolean(),
		message: z.string(),
		data: dataSchema.optional(),
	});

// Use it
const UserDataSchema = z.object({ id: z.string(), name: z.string() });

const response = await client.get('/users/123', APIResponseSchema(UserDataSchema));

if (response.success && response.data) {
	console.log(response.data.name);
}
```

## CLI-specific Usage

The CLI wrapper automatically handles version checking and user agent:

```typescript
import { APIClient, z } from '@agentuity/cli';
import type { Config, Logger } from '@agentuity/cli';

const logger: Logger = /* get from CLI context */;
const config: Config = {
	/* ... */
};

// Public API
const client = new APIClient('https://api.agentuity.com', logger, config);

// Authenticated API
const client = new APIClient('https://api.agentuity.com', logger, apiKey, config);

// Making requests (schema validation is built-in)
const ResponseSchema = z.object({
	/* ... */
});
const data = await client.get('/endpoint', ResponseSchema);
```

## Error Handling

```typescript
import { APIClient, APIError, ValidationError, UpgradeRequiredError } from '@agentuity/server';

try {
	const data = await client.get('/endpoint', schema);
} catch (error) {
	if (error instanceof ValidationError) {
		// Response didn't match schema
		console.error('Validation error:', error.issues);
	} else if (error instanceof APIError) {
		// HTTP error from API
		console.error(`API error ${error.status}:`, error.message);
	} else if (error instanceof UpgradeRequiredError) {
		// Client needs upgrade
		console.error('Please upgrade:', error.message);
	}
}
```
