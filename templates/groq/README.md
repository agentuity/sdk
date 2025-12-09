# {{PROJECT_NAME}}

An Agentuity project using the **Groq SDK with open-source models**.

## What You Get

- ✅ **Groq SDK** - Ultra-fast inference for open-source models
- ✅ **Llama 3.3 70B** - Powerful open-source language model
- ✅ **TypeScript** - Full type safety out of the box
- ✅ **Bun runtime** - Fast JavaScript runtime and package manager
- ✅ **React frontend** - Pre-configured web interface

## Project Structure

```
my-app/
├── src/
│   ├── agent/
│   │   └── hello/
│   │       ├── agent.ts  # AI-powered agent using Groq SDK
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
import Groq from 'groq-sdk';

const client = new Groq();

const agent = createAgent('hello', {
	description: 'My AI agent',
	schema: {
		input: s.object({ prompt: s.string() }),
		output: s.string(),
	},
	handler: async (_ctx, { prompt }) => {
		const completion = await client.chat.completions.create({
			model: 'llama-3.3-70b-versatile',
			messages: [{ role: 'user', content: prompt }],
		});
		return completion.choices[0]?.message?.content ?? '';
	},
});

export default agent;
```

## Learn More

- [Groq Documentation](https://console.groq.com/docs)
- [Groq SDK on npm](https://www.npmjs.com/package/groq-sdk)
- [Agentuity Documentation](https://agentuity.dev)
