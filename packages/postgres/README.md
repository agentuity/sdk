# @agentuity/postgres

Resilient PostgreSQL client with automatic reconnection for Agentuity projects.

## Features

- 🔄 **Automatic Reconnection** - Exponential backoff with jitter
- 🏷️ **Tagged Template Literals** - Clean, SQL-injection-safe queries
- 💼 **Transaction Support** - Full transaction and savepoint support
- 📊 **Connection Stats** - Track connection health and reconnection history
- 🔌 **Bun Native** - Wraps Bun's high-performance SQL driver

## Installation

```bash
bun add @agentuity/postgres
```

## Quick Start

```typescript
import { postgres } from '@agentuity/postgres';

// Create a client (uses DATABASE_URL environment variable by default)
const sql = postgres();

// Execute queries using tagged template literals
const users = await sql`SELECT * FROM users WHERE active = ${true}`;

// Parameterized queries are safe from SQL injection
const userId = 123;
const user = await sql`SELECT * FROM users WHERE id = ${userId}`;

// Close when done
await sql.close();
```

## Configuration

```typescript
import { postgres } from '@agentuity/postgres';

const sql = postgres({
	// Connection options
	url: 'postgres://user:pass@localhost:5432/mydb',
	// Or individual options:
	hostname: 'localhost',
	port: 5432,
	username: 'user',
	password: 'pass',
	database: 'mydb',

	// Connection pool
	max: 10, // Maximum connections
	idleTimeout: 30, // Seconds before idle connection is closed
	connectionTimeout: 30, // Seconds to wait for connection

	// TLS
	tls: true, // or { rejectUnauthorized: false } for self-signed certs

	// Reconnection
	reconnect: {
		enabled: true, // Enable auto-reconnect (default: true)
		maxAttempts: 10, // Maximum reconnection attempts
		initialDelayMs: 100, // Initial delay before first retry
		maxDelayMs: 30000, // Maximum delay between retries
		multiplier: 2, // Exponential backoff multiplier
		jitterMs: 1000, // Random jitter to prevent thundering herd
	},

	// Callbacks
	onclose: (error) => console.log('Connection closed', error),
	onreconnect: (attempt) => console.log(`Reconnecting... attempt ${attempt}`),
	onreconnected: () => console.log('Reconnected!'),
	onreconnectfailed: (error) => console.error('Reconnection failed', error),
});
```

## Transactions

```typescript
const tx = await sql.begin();

try {
	await tx`INSERT INTO users (name, email) VALUES (${name}, ${email})`;
	await tx`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${fromId}`;
	await tx`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${toId}`;
	await tx.commit();
} catch (error) {
	await tx.rollback();
	throw error;
}
```

### Transaction Options

```typescript
const tx = await sql.begin({
	isolationLevel: 'serializable', // 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable'
	readOnly: true,
	deferrable: true, // Only for serializable read-only
});
```

### Savepoints

```typescript
const tx = await sql.begin();

await tx`INSERT INTO users (name) VALUES ('Alice')`;

const savepoint = await tx.savepoint();
await tx`INSERT INTO users (name) VALUES ('Bob')`;

// Oops, rollback Bob but keep Alice
await savepoint.rollback();

await tx.commit(); // Only Alice is committed
```

## Reserved Connections

For operations that must run on the same connection:

```typescript
const conn = await sql.reserve();

try {
	await conn`SET LOCAL timezone = 'UTC'`;
	const result = await conn`SELECT NOW()`;
} finally {
	conn.release();
}
```

## Connection Stats

```typescript
const stats = sql.stats;

console.log({
	connected: stats.connected,
	reconnecting: stats.reconnecting,
	totalConnections: stats.totalConnections,
	reconnectAttempts: stats.reconnectAttempts,
	failedReconnects: stats.failedReconnects,
	lastConnectedAt: stats.lastConnectedAt,
	lastDisconnectedAt: stats.lastDisconnectedAt,
});
```

## Error Handling

```typescript
import {
	postgres,
	ConnectionClosedError,
	ReconnectFailedError,
	TransactionError,
	isRetryableError,
} from '@agentuity/postgres';

try {
	const result = await sql`SELECT * FROM users`;
} catch (error) {
	if (error instanceof ConnectionClosedError) {
		// Connection was closed - client will auto-reconnect
		console.log('Connection closed, waiting for reconnect...');
	}

	if (error instanceof ReconnectFailedError) {
		// All reconnection attempts failed
		console.error(`Failed after ${error.attempts} attempts`);
	}

	if (error instanceof TransactionError) {
		// Transaction operation failed
		console.error(`Transaction ${error.phase} failed`);
	}

	if (isRetryableError(error)) {
		// This error type would trigger automatic reconnection
	}
}
```

## Raw SQL Access

For advanced use cases, access the underlying Bun.SQL instance:

```typescript
// Get raw Bun.SQL instance
const bunSql = sql.raw;

// Execute unsafe (unparameterized) queries - use with caution!
const result = await sql.unsafe('SELECT * FROM users WHERE id = 1');
```

## API Reference

### `postgres(config?)`

Creates a new PostgreSQL client.

- `config` - Connection URL string or configuration object
- Returns: `CallablePostgresClient`

### `PostgresClient`

The main client class with the following methods:

- `query(strings, ...values)` - Execute a parameterized query
- `begin(options?)` - Start a transaction
- `reserve(options?)` - Reserve an exclusive connection
- `close()` - Close all connections
- `unsafe(query)` - Execute an unparameterized query

Properties:

- `connected` - Whether currently connected
- `reconnecting` - Whether reconnection is in progress
- `stats` - Connection statistics
- `raw` - Underlying Bun.SQL instance

### `Transaction`

Returned by `begin()`:

- `query(strings, ...values)` - Execute query in transaction
- `savepoint(name?)` - Create a savepoint
- `commit()` - Commit the transaction
- `rollback()` - Rollback the transaction

### `Savepoint`

Returned by `transaction.savepoint()`:

- `rollback()` - Rollback to this savepoint
- `release()` - Release the savepoint

### `ReservedConnection`

Returned by `reserve()`:

- `query(strings, ...values)` - Execute query on reserved connection
- `release()` - Release connection back to pool

## License

Apache-2.0
