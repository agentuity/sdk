# KeyValue Storage Example

This example demonstrates how to use the KeyValue storage service in an Agentuity agent.

## Features Demonstrated

- **Set** - Store values with optional TTL
- **Get** - Retrieve values by key
- **Delete** - Remove values
- **Get Keys** - List all keys in a store
- **Search** - Search for keys/values by keyword

## Running the Example

```bash
cd examples/services-keyvalue
bun install
bun run dev
```

## Testing

```bash
# Set a value
curl http://localhost:3500/agent/keyvalue \
  --json '{"operation":"set","key":"user:123","value":{"name":"Alice","age":30}}'

# Get a value
curl http://localhost:3500/agent/keyvalue \
  --json '{"operation":"get","key":"user:123"}'

# Delete a value
curl http://localhost:3500/agent/keyvalue \
  --json '{"operation":"delete","key":"user:123"}'

# List all keys
curl http://localhost:3500/agent/keyvalue \
  --json '{"operation":"getKeys"}'

# Search for keys/values
curl http://localhost:3500/agent/keyvalue \
  --json '{"operation":"search","keyword":"Alice"}'
```

## Key Concepts

### Storage Organization

KeyValue storage is organized into **stores** (namespaces). Each agent can use multiple stores:

```typescript
await ctx.kv.set('users', 'user:123', userData);
await ctx.kv.set('sessions', 'sess:abc', sessionData);
```

### TTL (Time To Live)

Set expiration on values:

```typescript
await ctx.kv.set('cache', 'temp-data', value, { ttl: 3600 }); // Expires in 1 hour
```

### Type Safety

Values are stored and retrieved with full type safety:

```typescript
interface User {
	name: string;
	age: number;
}

await ctx.kv.set('users', 'user:123', { name: 'Alice', age: 30 } as User);
const result = await ctx.kv.get<User>('users', 'user:123');
if (result.exists) {
	const user = result.data; // Typed as User
}
```

## Common Use Cases

- **User sessions** - Store session data with TTL
- **Caching** - Cache API responses or computed results
- **Configuration** - Store app configuration
- **Counters** - Track usage metrics
- **Feature flags** - Toggle features on/off
