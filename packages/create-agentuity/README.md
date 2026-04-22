# {{PROJECT_NAME}}

# create-agentuity

Create a new Agentuity project with one command.

## Usage

```bash
bun create agentuity my-project
cd my-project
bun run dev
```

Templates are automatically downloaded from the latest version in the GitHub repository.

## What You Get

A fully configured Agentuity project with:

- ✅ **TypeScript** - Full type safety out of the box
- ✅ **Bun runtime** - Fast JavaScript runtime and package manager
- ✅ **Hot reload** - Development server with auto-rebuild
- ✅ **Example agent** - Sample "hello" agent to get started
- ✅ **React frontend** - Pre-configured web interface
- ✅ **API routes** - Example API endpoints
- ✅ **Type checking** - TypeScript configuration ready to go

## Project Structure

```
my-app/
├── src/
│   ├── agent/           # Agent definitions
│   │   └── hello/
│   │       └── agent.ts # Example agent
│   ├── api/             # Custom API routes
│   │   └── route.ts     # Example route
│   └── web/             # React web application
│       └── app.tsx      # Main React component
├── app.ts               # Application entry point
├── tsconfig.json        # TypeScript configuration
├── package.json         # Dependencies and scripts
└── README.md            # Project documentation
```

## Available Commands

After creating your project, you can run:

### Development

```bash
bun run dev
```

Starts the development server at http://localhost:3500

### Build

```bash
bun run build
```

Compiles your application into the `.agentuity/` directory

### Type Check

```bash
bun run typecheck
```

Runs TypeScript type checking

## Next Steps

After creating your project:

1. **Customize the example agent** - Edit `src/agent/hello/agent.ts`
2. **Add new agents** - Create new folders in `src/agent/`
3. **Add API routes** - Create new routes in `src/web/`
4. **Customize the UI** - Edit `src/web/app.tsx`
5. **Configure your app** - Modify `app.ts` to add middleware, configure services, etc.

## Creating Custom Agents

Create a new agent by adding a folder in `src/agent/`:

```typescript
// src/agent/my-agent/agent.ts
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	metadata: {
		description: 'My amazing agent',
	},
	schema: {
		input: s.object({
			message: s.string(),
		}),
		output: s.object({
			response: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		return { response: `Processed: ${input.message}` };
	},
});

export default agent;
```

## Adding API Routes

Create custom routes in `src/api/`:

```typescript
// src/api/my-route/route.ts
import { createRouter } from '@agentuity/runtime';
import myAgent from '../../agent/my-agent/agent';

const router = createRouter();

router.get('/', async (c) => {
	const result = await myAgent.run({ message: 'Hello!' });
	return c.json(result);
});

router.post('/', myAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await myAgent.run(data);
	return c.json(result);
});

export default router;
```

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Zod Documentation](https://zod.dev/)

## Requirements

- [Bun](https://bun.sh/) v1.0 or higher
- TypeScript 5+

## License

Apache 2.0
