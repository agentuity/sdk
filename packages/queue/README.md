# @agentuity/queue

A standalone package for the Agentuity Queue service.

## Installation

```bash
npm install @agentuity/queue
```

## Quick Start

```typescript
import { QueueClient } from '@agentuity/queue';

const client = new QueueClient();

// Create a queue
await client.createQueue('order-processing');

// Publish a message
const result = await client.publish('order-processing', {
  orderId: 123,
  action: 'process'
}, {
  metadata: { priority: 'high' },
  ttl: 3600
});

console.log(`Message ${result.id} published`);

// Delete a queue
await client.deleteQueue('old-queue');
```

## Configuration

```typescript
const client = new QueueClient({
  apiKey: 'your-api-key',
  url: 'https://api.agentuity.com',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_QUEUE_URL` | Override Queue API URL | Auto-detected |

## License

Apache-2.0