# Agent Lifecycle Example

Demonstrates agent setup and shutdown lifecycle hooks for resource management.

## Features

- `setup()` - Initialize resources on app startup
- `shutdown()` - Cleanup resources on app shutdown
- Config access in handler via `ctx.config`
- Resource management patterns

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

Initialize resources once when the app starts:

```typescript
import { createAgent } from '@agentuity/runtime';

export default createAgent('lifecycle-example', {
	setup: async (app) => {
		// Initialize resources
		const db = await connectDatabase();
		const cache = new Map();

		console.log('Agent initialized');

		// Return config accessible in handler
		return { db, cache };
	},

	handler: async (ctx) => {
		// Access setup config
		const { db, cache } = ctx.config;

		const data = await db.query('SELECT * FROM users');
		cache.set('last-query', Date.now());

		return data;
	},

	shutdown: async (app, config) => {
		// Cleanup resources
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

1. **Keep setup fast** - App won't start until all setups complete
2. **Handle errors** - Setup/shutdown failures should be logged
3. **Cleanup thoroughly** - Always close connections in shutdown
4. **Use ctx.config** - Access setup results via context
5. **Avoid global state** - Use setup config instead
