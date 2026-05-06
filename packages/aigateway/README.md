# @agentuity/aigateway

A standalone package for the Agentuity AI Gateway service.

## Installation

```bash
npm install @agentuity/aigateway
```

## Quick Start

```typescript
import { AIGatewayClient } from '@agentuity/aigateway';

const client = new AIGatewayClient();

const models = await client.listModels();
console.log(Object.keys(models));

const completion = await client.complete({
	model: 'openai/gpt-4.1-mini',
	messages: [{ role: 'user', content: 'Say hello' }],
});

console.log(completion.choices?.[0]);
```

## Configuration

```typescript
const client = new AIGatewayClient({
	apiKey: 'your-api-key',
	orgId: 'your-org-id',
	url: 'https://aigateway-usc.agentuity.cloud',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_AIGATEWAY_KEY` | AI Gateway API key override | Optional |
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_AIGATEWAY_URL` | Override AI Gateway API URL | Auto-detected |

## License

Apache-2.0
