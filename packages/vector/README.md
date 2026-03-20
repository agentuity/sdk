# @agentuity/vector

A standalone package for the Agentuity Vector storage service.

## Installation

```bash
npm install @agentuity/vector
```

## Quick Start

```typescript
import { VectorClient } from '@agentuity/vector';

const client = new VectorClient();

// Upsert vectors with automatic embedding
await client.upsert('products', {
  key: 'chair-001',
  document: 'Comfortable office chair with lumbar support',
  metadata: { category: 'furniture', price: 299 }
});

// Search for similar vectors
const results = await client.search('products', {
  query: 'office seating',
  limit: 5,
  similarity: 0.7
});

for (const result of results) {
  console.log(`${result.key}: ${result.similarity * 100}% match`);
}
```

## Configuration

```typescript
const client = new VectorClient({
  apiKey: 'your-api-key',
  url: 'https://api.agentuity.com',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_VECTOR_URL` | Override Vector API URL | Auto-detected |

## License

Apache-2.0