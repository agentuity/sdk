# {{PROJECT_NAME}}

An Agentuity project using the **Vercel AI SDK with OpenAI**.

## What You Get

- ✅ **Vercel AI SDK** - Unified API for AI providers
- ✅ **OpenAI GPT-5-mini** - Fast, capable language model
- ✅ **TypeScript** - Full type safety out of the box
- ✅ **Bun runtime** - Fast JavaScript runtime and package manager
- ✅ **React frontend** - Pre-configured web interface

## Project Structure

```
my-app/
├── src/
│   ├── agent/
│   │   └── hello/
│   │       ├── agent.ts  # AI-powered agent using Vercel AI SDK
│   │       └── index.ts
│   ├── api/
│   │   └── index.ts
│   └── web/
│       ├── App.tsx
│       ├── frontend.tsx
│       └── index.html
├── app.ts
├── package.json
└── README.md
```

## Available Commands

### Development

```bash
bun dev
```

Starts the development server at `http://localhost:3500`

### Build

```bash
bun build
```

### Deploy to Agentuity

```bash
bun run deploy
```

## Customizing Your Agent

Edit `src/agent/hello/agent.ts` to customize the AI behavior:

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const agent = createAgent('hello', {
	description: 'My AI agent',
	schema: {
		input: s.object({ prompt: s.string() }),
		output: s.string(),
	},
	handler: async (_ctx, { prompt }) => {
		const { text } = await generateText({
			model: openai('gpt-5-mini'),
			prompt,
		});
		return text;
	},
});

export default agent;
```

## Learn More

- [Vercel AI SDK Documentation](https://ai-sdk.dev)
- [OpenAI Provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
- [Agentuity Documentation](https://agentuity.dev)
