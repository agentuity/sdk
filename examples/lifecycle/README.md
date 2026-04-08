# Agent Lifecycle Example

Demonstrates agent-level `setup()` and `shutdown()` lifecycle hooks for resource management.

## Features

- `setup()` - Initialize resources once when the agent starts; return value is available as `ctx.config`
- `shutdown()` - Clean up resources when the agent stops
- `ctx.config` - Typed access to everything returned by `setup()`
- Event listeners for `started` and `completed` events

## Running

```bash
cd examples/lifecycle
bun install
bun run build
bun run dev
```

## Usage

```bash
curl http://localhost:3500/agent/lifecycle
```

## Key Concepts

### Setup Hook

Called once when the agent initializes. Return an object and it becomes `ctx.config` in the handler, fully typed.

```typescript
import { createAgent } from '@agentuity/runtime';

export default createAgent('lifecycle-example', {
	setup: async () => {
		// Open connections, load config, allocate resources
		const db = await connectDatabase();
		const cache = new Map();

		console.log('Agent initialized');

		// Return value is available as ctx.config
		return { db, cache };
	},

	handler: async (ctx, input) => {
		// ctx.config is typed from the setup return value
		const { db, cache } = ctx.config;

		const data = await db.query('SELECT * FROM users');
		cache.set('last-query', Date.now());

		return data;
	},

	shutdown: async (_app, config) => {
		// Cleanup resources when the agent stops
		await config.db.close();
		config.cache.clear();

		console.log('Agent shutdown complete');
	},
});
```

### Use Cases

- **Database connections** - Open on startup, close on shutdown
- **Caching** - Initialize cache, clear on shutdown
- **External services** - Connect once, reuse across requests
- **Background workers** - Start on setup, stop on shutdown
- **Resource pooling** - Create pools, manage lifecycle

## Best Practices

1. **Keep setup fast** - The agent won't handle requests until setup completes
2. **Handle errors** - Setup/shutdown failures should be logged
3. **Cleanup thoroughly** - Always close connections in shutdown
4. **Use ctx.config** - Access setup results via context rather than module-level globals
5. **Avoid global state** - Use the setup return value instead
