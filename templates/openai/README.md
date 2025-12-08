# {{PROJECT_NAME}}

An Agentuity project using the **OpenAI SDK**.

## What You Get

- ✅ **OpenAI SDK** - Official OpenAI Node.js library
- ✅ **OpenAI GPT-4o-mini** - Fast, capable language model
- ✅ **TypeScript** - Full type safety out of the box
- ✅ **Bun runtime** - Fast JavaScript runtime and package manager
- ✅ **React frontend** - Pre-configured web interface

## Project Structure

```
my-app/
├── src/
│   ├── agent/
│   │   └── hello/
│   │       ├── agent.ts  # AI-powered agent using OpenAI SDK
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
import OpenAI from 'openai';

const client = new OpenAI();

const agent = createAgent('hello', {
  description: 'My AI agent',
  schema: {
    input: s.object({ prompt: s.string() }),
    output: s.string(),
  },
  handler: async (_ctx, { prompt }) => {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return completion.choices[0]?.message?.content ?? '';
  },
});

export default agent;
```

## Learn More

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Node.js Library](https://github.com/openai/openai-node)
- [Agentuity Documentation](https://agentuity.dev)
