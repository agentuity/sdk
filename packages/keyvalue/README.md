# @agentuity/keyvalue

A standalone package for the Agentuity Key-Value storage service.

## Installation

```bash
npm install @agentuity/keyvalue
```

## Quick Start

```typescript
import { KeyValueClient } from '@agentuity/keyvalue';

const client = new KeyValueClient();

// Set a value with optional TTL
await client.set('my-namespace', 'user:123', { name: 'John', email: 'john@example.com' }, {
  ttl: 3600 // expires in 1 hour
});

// Get a value
const result = await client.get('my-namespace', 'user:123');
if (result.exists) {
  console.log('Found:', result.data);
  console.log('Content-Type:', result.contentType);
}

// Delete a value
await client.delete('my-namespace', 'user:123');

// Get namespace statistics
const stats = await client.getStats('my-namespace');
console.log(`${stats.count} keys, ${stats.sum} bytes`);

// Search for keys
const results = await client.search('my-namespace', 'user');
```

## Configuration

The client can be configured with options:

```typescript
const client = new KeyValueClient({
  apiKey: 'your-api-key',           // or set AGENTUITY_SDK_KEY
  url: 'https://api.agentuity.com', // or set AGENTUITY_KV_URL
  logger: customLogger,              // optional custom logger
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_KV_URL` | Override KV API URL | Auto-detected |

## TTL (Time-to-Live)

Keys can have an optional TTL:

```typescript
// Key expires in 1 hour
await client.set('ns', 'key', value, { ttl: 3600 });

// Key never expires
await client.set('ns', 'key', value, { ttl: null });

// Key uses namespace default TTL
await client.set('ns', 'key', value);
```

## License

Apache-2.0