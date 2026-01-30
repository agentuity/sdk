# Agent Guidelines for @agentuity/drizzle

## Package Overview

Drizzle ORM integration with resilient PostgreSQL connections for Agentuity projects. Combines the type-safety of Drizzle ORM with @agentuity/postgres's automatic reconnection capabilities.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Bun (required for native SQL driver)
- **Dependencies**: `@agentuity/postgres`, `drizzle-orm`, `better-auth`
- **Features**: Type-safe queries, automatic reconnection, schema definitions

## Code Conventions

- **Factory function**: Use `createPostgresDrizzle()` to create instances
- **Schema-first**: Define schemas using Drizzle's `pgTable` and column types
- **Connection handling**: Automatic reconnection via @agentuity/postgres
- **Type safety**: Full TypeScript support with schema inference

## Usage Pattern

```typescript
import { createPostgresDrizzle, pgTable, text, serial, eq } from '@agentuity/drizzle';

// Define schema
const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
});

// Create database instance (uses DATABASE_URL by default)
const { db, client, close } = createPostgresDrizzle({
	schema: { users },
});

// Or with explicit configuration
const { db, close } = createPostgresDrizzle({
	connectionString: 'postgres://user:pass@localhost:5432/mydb',
	schema: { users },
	logger: true,
	reconnect: {
		maxAttempts: 5,
		initialDelayMs: 100,
	},
	onReconnected: () => console.log('Reconnected!'),
});

// Execute type-safe queries
const allUsers = await db.select().from(users);
const user = await db.select().from(users).where(eq(users.id, 1));

// Access underlying client for raw queries or stats
console.log(client.stats);
const raw = await client`SELECT NOW()`;

// Clean up
await close();
```

## Integration with @agentuity/auth

```typescript
import { createPostgresDrizzle, drizzleAdapter } from '@agentuity/drizzle';
import { createAuth } from '@agentuity/auth';
import * as schema from './schema';

const { db, close } = createPostgresDrizzle({ schema });

const auth = createAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),
});
```

## Re-exports

This package re-exports commonly used items for convenience:

### From @agentuity/postgres

- `postgres` - Factory function for creating postgres clients
- `PostgresClient` - Client class
- `CallablePostgresClient` - Callable client type
- `PostgresConfig`, `ReconnectConfig`, `ConnectionStats`, etc.

### From drizzle-orm

- Query operators: `sql`, `eq`, `and`, `or`, `not`, `desc`, `asc`, `gt`, `gte`, `lt`, `lte`, `ne`, `isNull`, `isNotNull`, `inArray`, `notInArray`, `between`, `like`, `ilike`

### From drizzle-orm/pg-core

- Schema definitions: `pgTable`, `pgSchema`, `pgEnum`
- Column types: `text`, `integer`, `serial`, `boolean`, `timestamp`, `uuid`, `json`, `jsonb`, etc.
- Constraints: `primaryKey`, `foreignKey`, `unique`, `uniqueIndex`, `index`, `check`

### From better-auth

- `drizzleAdapter` - For use with @agentuity/auth

## Testing

- Tests require a running PostgreSQL instance
- Use `@agentuity/test-utils` for mocking
- When running tests, prefer using a subagent (Task tool) to avoid context bloat

## Publishing

1. Run build and typecheck
2. Publish **after** `@agentuity/postgres`
