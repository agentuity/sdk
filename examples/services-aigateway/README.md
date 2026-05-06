# AI Gateway Service Example

This example demonstrates how to use the standalone `@agentuity/aigateway` TypeScript API from an Agentuity agent.

## Features Demonstrated

- **Model discovery** - List AI Gateway models grouped by provider
- **Filtering** - Filter models by provider, input modality, and reasoning support
- **Completions** - Run routed LLM completions through AI Gateway
- **Standalone client** - Use `AIGatewayClient` inside an Agentuity runtime app

## Running the Example

```bash
cd examples/services-aigateway
bun install
bun run dev
```

## Testing the AI Gateway API Directly

```bash
# List all models
curl https://aigateway-usc.agentuity.cloud/models

# List OpenAI models
curl https://aigateway-usc.agentuity.cloud/models/openai

# Run a completion
curl https://aigateway-usc.agentuity.cloud/ \
  -H "Authorization: Bearer $AGENTUITY_AIGATEWAY_KEY" \
  -H "x-agentuity-orgid: $AGENTUITY_CLOUD_ORG_ID" \
  --json '{"model":"openai/gpt-4.1-mini","messages":[{"role":"user","content":"Say hello in one sentence."}]}'
```

## Key Concepts

### Client Setup

```typescript
import { AIGatewayClient } from '@agentuity/aigateway';

const client = new AIGatewayClient();
```

The client uses standard Agentuity environment variables:

- `AGENTUITY_AIGATEWAY_KEY`
- `AGENTUITY_SDK_KEY`
- `AGENTUITY_REGION`
- `AGENTUITY_AIGATEWAY_URL`

### Model Discovery

```typescript
const catalog = await client.listModels();
for (const [provider, models] of Object.entries(catalog)) {
	console.log(provider, models.map((model) => model.id));
}
```

### Completion

```typescript
const completion = await client.complete({
	model: 'openai/gpt-4.1-mini',
	messages: [{ role: 'user', content: 'Say hello' }],
});
```

## Common Use Cases

- **Provider-agnostic LLM calls** - Route completion requests through AI Gateway
- **Model picker UIs** - Populate dropdowns from live model metadata
- **Capability filtering** - Select models by modality or reasoning support
- **Centralized billing and auth** - Use Agentuity credentials instead of provider-specific keys
