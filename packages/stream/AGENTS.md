# Agent Guidelines for @agentuity/stream

Stream storage client for durable, resumable data streams.

## Usage

```typescript
import { StreamClient } from '@agentuity/stream';

const client = new StreamClient();

// Create a stream
const stream = await client.create('my-namespace', {
	contentType: 'application/json',
	metadata: { key: 'value' }
});

// Write to stream
await stream.write({ data: 'hello' });
await stream.close();

// List streams
const { streams, total } = await client.list({ namespace: 'my-namespace' });

// Download stream content
const readable = await client.download(stream.id);
```

## Configuration

- `apiKey` - API key (defaults to `AGENTUITY_SDK_KEY` or `AGENTUITY_CLI_KEY` env)
- `url` - Base URL (defaults to `AGENTUITY_STREAM_URL` or regional URL)
- `orgId` - Organization ID for multi-tenant operations
- `logger` - Custom logger instance