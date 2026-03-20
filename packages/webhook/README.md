# @agentuity/webhook

A standalone package for the Agentuity Webhook service.

## Installation

```bash
npm install @agentuity/webhook
```

## Quick Start

```typescript
import { WebhookClient } from '@agentuity/webhook';

const client = new WebhookClient();

// Create a webhook
const { webhook } = await client.create({
  name: 'GitHub Events',
  description: 'Receives GitHub webhook events'
});

console.log('Ingest URL:', webhook.url);

// Add a destination
await client.createDestination(webhook.id, {
  type: 'url',
  config: { url: 'https://example.com/webhook' }
});

// List receipts
const { receipts } = await client.listReceipts(webhook.id);
for (const receipt of receipts) {
  console.log(`Received: ${receipt.id} at ${receipt.date}`);
}

// Check delivery status
const { deliveries } = await client.listDeliveries(webhook.id);
for (const d of deliveries) {
  console.log(`${d.status} → ${d.webhook_destination_id}`);
}
```

## Configuration

```typescript
const client = new WebhookClient({
  apiKey: 'your-api-key',
  url: 'https://api.agentuity.com',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_WEBHOOK_URL` | Override Webhook API URL | Auto-detected |

## License

Apache-2.0