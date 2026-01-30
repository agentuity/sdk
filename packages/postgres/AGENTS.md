# Agent Guidelines for @agentuity/postgres

## Package Overview

Resilient PostgreSQL client with automatic reconnection for Agentuity projects. Wraps Bun's native SQL driver and adds connection resilience.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Bun (required for native SQL driver)
- **Dependencies**: `@agentuity/core` only
- **Features**: Automatic reconnection, exponential backoff, transactions, connection pooling

## Code Conventions

- **Tagged template literals**: Primary query interface
- **Exponential backoff**: With jitter for reconnection
- **Error handling**: Use StructuredError from @agentuity/core
- **Type safety**: Full TypeScript support

## Usage Pattern

```typescript
import { postgres } from '@agentuity/postgres';

// Create client (uses DATABASE_URL by default)
const sql = postgres();

// Or with explicit config
const sql = postgres({
	hostname: 'localhost',
	port: 5432,
	database: 'mydb',
	reconnect: {
		maxAttempts: 5,
		initialDelayMs: 100,
	},
});

// Query using tagged template literals
const users = await sql`SELECT * FROM users WHERE active = ${true}`;

// Transactions
const tx = await sql.begin();
try {
	await tx`INSERT INTO users (name) VALUES (${name})`;
	await tx.commit();
} catch (error) {
	await tx.rollback();
	throw error;
}
```

## Error Handling

```typescript
import { isRetryableError, ConnectionClosedError } from '@agentuity/postgres';

try {
	const result = await sql`SELECT * FROM users`;
} catch (error) {
	if (error instanceof ConnectionClosedError) {
		// Connection was closed, client will auto-reconnect
	}
	if (isRetryableError(error)) {
		// This error type triggers automatic reconnection
	}
}
```

## Reconnection Behavior

The client automatically reconnects when:

- Connection is closed unexpectedly
- Network errors occur (ECONNRESET, ETIMEDOUT, etc.)
- PostgreSQL server restarts

Reconnection uses exponential backoff with jitter to prevent thundering herd.

## Testing

- Tests require a running PostgreSQL instance
- Use `@agentuity/test-utils` for mocking
- When running tests, prefer using a subagent (Task tool) to avoid context bloat

## Publishing

1. Run build and typecheck
2. Publish **after** `@agentuity/core`
