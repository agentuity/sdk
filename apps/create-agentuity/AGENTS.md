# Agent Guidelines for {{PROJECT_NAME}}

## Commands

- **Build**: `bun run build` (compiles your application)
- **Dev**: `bun run dev` (starts development server)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)

## Architecture

- **Runtime**: Bun server runtime
- **Framework**: Hono (lightweight web framework)
- **Build tool**: `@agentuity/bundler` compiles to `.agentuity/` directory
- **Frontend**: React with `@agentuity/react` hooks

## Project Structure

```
{{PROJECT_NAME}}/
├── src/
│   ├── agents/          # Agent definitions
│   │   └── hello/       # Example "hello" agent
│   │       ├── agent.ts # Agent handler
│   │       └── route.ts # Agent HTTP routes
│   ├── apis/            # Custom API routes
│   │   └── status/      # Example status endpoint
│   └── web/             # React web application
│       └── app.tsx      # Main React component
├── app.ts               # Application entry point
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies and scripts
```

## Code Style

- **TypeScript-first** - All code is TypeScript
- **Async/await** - All agent handlers are async
- **Zod schemas** - Use Zod for input/output validation
- **Functional** - Prefer functional patterns over classes
- **Type-safe** - Leverage TypeScript generics and inference

## Creating Agents

### Agent Structure

Each agent should be in its own folder under `src/agents/`:

```typescript
// src/agents/my-agent/agent.ts
import { type AgentContext, createAgent } from '@agentuity/server';
import { z } from 'zod';

const agent = createAgent({
	schema: {
		input: z.object({
			message: z.string(),
		}),
		output: z.object({
			response: z.string(),
		}),
	},
	handler: async (ctx: AgentContext, input) => {
		// Use ctx.logger for logging (not console.log)
		ctx.logger.info('Processing message:', input.message);

		// Access storage
		await ctx.kv.set('last-message', input.message);

		return { response: `Processed: ${input.message}` };
	},
});

export default agent;
```

### Agent Routes (Optional)

Add custom HTTP routes for your agent:

```typescript
// src/agents/my-agent/route.ts
import { createRouter } from '@agentuity/server';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

// GET endpoint
router.get('/', async (c) => {
	const result = await c.agent['my-agent'].run({ message: 'Hello!' });
	return c.json(result);
});

// POST endpoint with validation
router.post('/', zValidator('json', agent.inputSchema!), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent['my-agent'].run(data);
	return c.json(result);
});

export default router;
```

## Agent Context API

Every agent handler receives an `AgentContext` with:

- `ctx.logger` - Structured logger (use instead of console.log)
- `ctx.tracer` - OpenTelemetry tracer for distributed tracing
- `ctx.sessionId` - Unique session identifier
- `ctx.kv` - Key-value storage interface
- `ctx.objectstore` - Object/blob storage
- `ctx.stream` - Stream storage
- `ctx.vector` - Vector embeddings storage
- `ctx.agent` - Access to other agents
- `ctx.waitUntil()` - Defer cleanup tasks

## Adding API Routes

Create custom routes in `src/apis/`:

```typescript
// src/apis/my-route/route.ts
import { createRouter } from '@agentuity/server';

const router = createRouter();

router.get('/', (c) => {
	return c.json({ status: 'ok' });
});

export default router;
```

## Frontend Development

Use `@agentuity/react` hooks to call agents from your React components:

```typescript
// src/web/app.tsx
import { useAgent } from '@agentuity/react';

function MyComponent() {
  const { data, run } = useAgent('hello');

  const handleClick = async () => {
    const result = await run({ name: 'World' });
    console.log(result);
  };

  return (
    <div>
      <button onClick={handleClick}>Call Agent</button>
      {data && <div>{data}</div>}
    </div>
  );
}
```

## Best Practices

- **Use structured logging** - Always use `ctx.logger`, never `console.log`
- **Validate inputs** - Define Zod schemas for all agent inputs/outputs
- **Handle errors** - Use try/catch and return meaningful error messages
- **Type everything** - Leverage TypeScript for type safety
- **Keep agents focused** - One agent should do one thing well
- **Use storage abstractions** - Use `ctx.kv`, `ctx.objectstore`, etc. instead of direct database access

## Environment Variables

Create a `.env` file in the project root:

```env
# Example environment variables
API_KEY=your-api-key
DATABASE_URL=your-database-url
```

Access them in your code:

```typescript
const apiKey = process.env.API_KEY;
```

## Deployment

Build for production:

```bash
bun run build
```

The compiled application will be in `.agentuity/`. Deploy this directory to your hosting provider.

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Zod Documentation](https://zod.dev/)
