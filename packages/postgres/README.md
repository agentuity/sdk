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

## Graceful Shutdown

The client automatically detects application shutdown signals (SIGTERM, SIGINT) and prevents reconnection attempts during shutdown:

```typescript
// Automatic: SIGTERM/SIGINT will prevent reconnection

// Manual: For graceful shutdown with connection draining
process.on('SIGTERM', async () => {
	sql.shutdown(); // Prevent reconnection
	// Wait for in-flight queries to complete...
	await sql.close(); // Then close
	process.exit(0);
});
```

## Waiting for Connection

If you need to ensure the connection is established before proceeding:

```typescript
// Wait for connection (useful after reconnection)
await sql.waitForConnection();

// With timeout
await sql.waitForConnection(5000); // 5 second timeout
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

For advanced use cases, you can execute unparameterized queries:

```typescript
// Execute unsafe (unparameterized) queries - use with caution!
// This bypasses SQL injection protection
const result = await sql.unsafe('SELECT * FROM users WHERE id = 1');

// Access the underlying Bun.SQL instance for advanced operations
const rawSql = sql.raw;
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
- `close()` - Close all connections
- `shutdown()` - Signal shutdown (prevents reconnection)
- `waitForConnection(timeoutMs?)` - Wait for connection to be established
- `unsafe(query)` - Execute an unparameterized query

Properties:

- `connected` - Whether currently connected
- `reconnecting` - Whether reconnection is in progress
- `shuttingDown` - Whether shutdown has been signaled
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

## Global Registry and Runtime Integration

All PostgreSQL clients are automatically registered in a global registry. When used with `@agentuity/runtime`, clients are automatically closed during graceful shutdown.

### Manual Shutdown (without runtime)

```typescript
import { shutdownAll, getClientCount } from '@agentuity/postgres';

// Check how many clients are active
console.log(`Active clients: ${getClientCount()}`);

// Shut down all clients (with optional timeout)
process.on('SIGTERM', async () => {
	await shutdownAll(5000); // 5 second timeout
	process.exit(0);
});
```

### With @agentuity/runtime

When using `@agentuity/runtime`, postgres clients are automatically closed during graceful shutdown - no additional code needed:

```typescript
import { createApp } from '@agentuity/runtime';
import { postgres } from '@agentuity/postgres';

// Create postgres client - it auto-registers with the runtime
const sql = postgres();

const app = await createApp({
	// ... your app config
});

// When the runtime shuts down (SIGTERM/SIGINT), all postgres
// clients are automatically closed via the shutdown hook system
```

## License

Apache-2.0
