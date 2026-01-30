# @agentuity/drizzle

Drizzle ORM integration with resilient PostgreSQL connections for Agentuity projects.

## Installation

```bash
bun add @agentuity/drizzle
```

## Features

- **Type-safe queries** - Full TypeScript support with Drizzle ORM's schema inference
- **Automatic reconnection** - Built on @agentuity/postgres with exponential backoff
- **Convenient re-exports** - Common Drizzle utilities available from a single import
- **Auth integration** - Works seamlessly with @agentuity/auth via drizzleAdapter

## Basic Usage

```typescript
import { createPostgresDrizzle, pgTable, text, serial, eq } from '@agentuity/drizzle';

// Define your schema
const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
});

// Create database instance (uses DATABASE_URL by default)
const { db, close } = createPostgresDrizzle({
	schema: { users },
});

// Execute type-safe queries
const allUsers = await db.select().from(users);
const user = await db.select().from(users).where(eq(users.id, 1));

// Insert data
await db.insert(users).values({ name: 'Alice', email: 'alice@example.com' });

// Clean up when done
await close();
```

## Custom Configuration

```typescript
import { createPostgresDrizzle } from '@agentuity/drizzle';
import * as schema from './schema';

const { db, client, close } = createPostgresDrizzle({
	// Connection string (defaults to DATABASE_URL)
	connectionString: 'postgres://user:pass@localhost:5432/mydb',

	// Your Drizzle schema
	schema,

	// Enable query logging
	logger: true,

	// Reconnection settings
	reconnect: {
		maxAttempts: 5,
		initialDelayMs: 100,
		maxDelayMs: 30000,
	},

	// Callbacks
	onConnect: () => console.log('Connected to database'),
	onReconnected: () => console.log('Reconnected to database'),
});

// Access connection statistics
console.log(client.stats);
// { connected: true, reconnecting: false, totalConnections: 1, ... }
```

## Using with @agentuity/auth

```typescript
import { createPostgresDrizzle, drizzleAdapter } from '@agentuity/drizzle';
import { createAuth } from '@agentuity/auth';
import * as schema from './schema';

// Create database instance
const { db, close } = createPostgresDrizzle({ schema });

// Create auth with Drizzle adapter
const auth = createAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),
});
```

## Accessing the Underlying Client

The `client` property gives you access to the @agentuity/postgres client for raw queries:

```typescript
const { db, client, close } = createPostgresDrizzle({ schema });

// Use Drizzle for type-safe queries
const users = await db.select().from(schema.users);

// Use the client for raw queries
const result = await client`SELECT NOW()`;

// Check connection status
if (client.connected) {
	console.log('Database is connected');
}

// Access connection statistics
console.log(client.stats);
```

## Available Re-exports

### Query Operators (from drizzle-orm)

```typescript
import {
	sql,
	eq,
	and,
	or,
	not,
	desc,
	asc,
	gt,
	gte,
	lt,
	lte,
	ne,
	isNull,
	isNotNull,
	inArray,
	notInArray,
	between,
	like,
	ilike,
} from '@agentuity/drizzle';
```

### Schema Definitions (from drizzle-orm/pg-core)

```typescript
import {
	// Table and schema
	pgTable,
	pgSchema,
	pgEnum,

	// Column types
	text,
	varchar,
	char,
	integer,
	smallint,
	bigint,
	serial,
	smallserial,
	bigserial,
	boolean,
	timestamp,
	date,
	time,
	interval,
	json,
	jsonb,
	uuid,
	numeric,
	real,
	doublePrecision,
	inet,
	cidr,
	macaddr,
	macaddr8,

	// Constraints
	primaryKey,
	foreignKey,
	unique,
	uniqueIndex,
	index,
	check,
} from '@agentuity/drizzle';
```

### Postgres Client (from @agentuity/postgres)

```typescript
import {
	postgres,
	PostgresClient,
	type CallablePostgresClient,
	type PostgresConfig,
	type ReconnectConfig,
	type ConnectionStats,
} from '@agentuity/drizzle';
```

### Auth Adapter (from better-auth)

```typescript
import { drizzleAdapter } from '@agentuity/drizzle';
```

## API Reference

### createPostgresDrizzle(config?)

Creates a Drizzle ORM instance with a resilient PostgreSQL connection.

#### Parameters

| Parameter                 | Type                       | Description                                           |
| ------------------------- | -------------------------- | ----------------------------------------------------- |
| `config.connectionString` | `string`                   | PostgreSQL connection URL. Defaults to `DATABASE_URL` |
| `config.connection`       | `PostgresConfig`           | Full connection configuration object                  |
| `config.schema`           | `TSchema`                  | Drizzle schema for type-safe queries                  |
| `config.logger`           | `boolean \| DrizzleLogger` | Enable query logging                                  |
| `config.reconnect`        | `ReconnectConfig`          | Reconnection behavior configuration                   |
| `config.onConnect`        | `() => void`               | Called when initially connected                       |
| `config.onReconnected`    | `() => void`               | Called after successful reconnection                  |

#### Returns

| Property | Type                      | Description                    |
| -------- | ------------------------- | ------------------------------ |
| `db`     | `BunSQLDatabase<TSchema>` | The Drizzle database instance  |
| `client` | `CallablePostgresClient`  | The underlying postgres client |
| `close`  | `() => Promise<void>`     | Cleanup function               |

## License

Apache-2.0
