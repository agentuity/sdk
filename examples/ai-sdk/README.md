# AI SDK Integration Example

Demonstrates how to integrate AI SDK (Vercel AI SDK) with Agentuity agents for streaming AI responses.

## Features

- AI SDK integration with OpenAI
- Streaming responses from LLMs
- Type-safe AI model interactions

## Running

```bash
cd examples/ai-sdk
bun install
bun run build
bun run dev
```

## Usage

```bash
curl http://localhost:3500/agent/aisdk \
  --json '{"prompt":"What is TypeScript?"}'
```

## Key Concepts

### AI SDK Integration

Use Vercel AI SDK to stream responses from LLMs:

```typescript
import { createAgent } from '@agentuity/runtime';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export default createAgent('ai-example', {
	schema: {
		input: z.object({ prompt: z.string() }),
		stream: true,
	},
	handler: async (ctx, { prompt }) => {
		const result = await streamText({
			model: openai('gpt-4'),
			prompt,
		});

		return result.textStream;
	},
});
```

## Environment Variables

Required for AI features:

```bash
OPENAI_API_KEY=sk-...
```
