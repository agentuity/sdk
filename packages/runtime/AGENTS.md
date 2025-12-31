# Agent Guidelines for @agentuity/runtime

## Package Overview

Hono-based server runtime for Agentuity applications, optimized for Bun with OpenTelemetry observability.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Test**: `bun test`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Bun (required for native WebSocket)
- **Framework**: Hono
- **Dependencies**: `@agentuity/core`, Hono, OpenTelemetry
- **Features**: WebSocket, SSE, streaming, storage abstractions (kv, vector, stream)

## Code Conventions

- **Agent context**: Every handler receives `AgentContext` with logger, tracer, storage, auth
- **Schema validation**: Use `agent.validator()` for automatic input validation
- **Observability**: Use `ctx.logger` not `console.log`
- **Type inference**: Let TypeScript infer handler types from schemas

## Agent Pattern

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('my-agent', {
	description: 'What this agent does',
	schema: {
		input: s.object({ name: s.string() }),
		output: s.object({ id: s.string() }),
	},
	handler: async (ctx, input) => {
		// ctx.logger, ctx.kv, ctx.tracer, ctx.auth available
		return { id: `user-${input.name}` };
	},
});
```

## Authentication (ctx.auth)

When using `@agentuity/auth` middleware, `ctx.auth` is available on AgentContext:

```typescript
export default createAgent('protected-agent', {
	handler: async (ctx, input) => {
		// ctx.auth is null for unauthenticated requests
		if (!ctx.auth) {
			return { error: 'Please sign in' };
		}

		// Access user data
		const user = await ctx.auth.getUser();

		// Check organization roles
		if (await ctx.auth.hasOrgRole('admin')) {
			// Admin logic
		}

		// Check API key permissions (for API key auth)
		if (ctx.auth.authMethod === 'api-key') {
			if (!ctx.auth.hasPermission('data', 'read')) {
				return { error: 'Insufficient permissions' };
			}
		}

		return { userId: user.id };
	},
});
```

**Key properties:**

- `ctx.auth.getUser()` - Get authenticated user
- `ctx.auth.org` - Active organization context (if any)
- `ctx.auth.getOrgRole()` - Get user's role in active org
- `ctx.auth.hasOrgRole(...roles)` - Check if user has one of the roles
- `ctx.auth.authMethod` - 'session' | 'api-key' | 'bearer'
- `ctx.auth.hasPermission(resource, ...actions)` - Check API key permissions

## Route Validation

```typescript
const router = createRouter();

// Automatic validation from agent schema
router.post('/', myAgent.validator(), async (c) => {
	const data = c.req.valid('json'); // Fully typed!
	return c.json(await myAgent.run(data));
});
```

## Type Safety

**CRITICAL:** Do NOT add type annotations to handler parameters - let TypeScript infer them.

See [TYPE_SAFETY.md](TYPE_SAFETY.md) for detailed documentation.

## Testing

- Use `app.request()` for route testing (NOT `testClient()`)
- Mock contexts from `test/helpers/test-context.ts`
- Import from `../src/` in tests
- When running tests, prefer using a subagent (Task tool) to avoid context bloat from test output

## Publishing

1. Run build, typecheck, test
2. Publish **after** `@agentuity/core`
