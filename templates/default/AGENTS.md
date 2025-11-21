# Agent Guidelines for {{PROJECT_NAME}}

## Commands

- **Build**: `bun run build` (compiles your application)
- **Dev**: `bun run dev` (starts development server)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Deploy**: `bun run deploy` (deploys your app to the Agentuity cloud)

## Agent-Friendly CLI

The Agentuity CLI is designed to be agent-friendly with programmatic interfaces, structured output, and comprehensive introspection.

### Discovering CLI Capabilities

Get the complete CLI schema with all commands, options, examples, and metadata:

```bash
agentuity schema show --json > schema.json
```

The schema includes:

- **Exit codes**: Map error types to exit codes (0=success, 2=validation, 3=auth, 4=not-found, etc.)
- **Command metadata**: Tags, idempotency, prerequisites, pagination info
- **Response schemas**: JSON Schema definitions for command outputs
- **Global options**: Flags available on all commands
- **Examples**: Usage examples for each command

### Command Tags for Intelligence

Every command is tagged to help you understand its behavior:

**Destructiveness:**

- `read-only` - No state changes (safe to run anytime)
- `mutating` - Modifies state (check before running)
- `destructive` - Irreversible deletions (requires confirmation)

**Performance:**

- `fast` - Completes in < 1s (local operations)
- `slow` - May take > 2s (network/API calls)
- `api-intensive` - Makes multiple API calls

**Resource Impact:**

- `creates-resource` - Creates new resources
- `updates-resource` - Modifies existing resources
- `deletes-resource` - Removes resources

**State Requirements:**

- `requires-auth` - Must be logged in
- `requires-project` - Must be in project directory
- `requires-deployment` - Needs active deployment

**Example - Find safe commands:**

```bash
# Get all read-only commands
jq '.commands[] | .. | select(.tags? and (.tags | contains(["read-only"]))) | .name' schema.json

# Get destructive commands (need extra care)
jq '.commands[] | .. | select(.tags? and (.tags | contains(["destructive"]))) | .name' schema.json
```

### Response Schemas

35+ commands provide JSON Schema definitions for their output:

```bash
# Get response schema for a command
jq '.commands[] | .. | select(.name=="whoami") | .response' schema.json
```

**Commands with response schemas:**

- List commands: `project list`, `deployment list`, `kv list-namespaces`
- Get commands: `secret get`, `env get`, `kv get`, `objectstore get`
- Show commands: `project show`, `deployment show`, `profile show`
- Set commands: `secret set`, `env set`, `kv set`
- Stats commands: `kv stats`
- Auth commands: `whoami`, `ssh list`

### Validation Mode

Test arguments before execution:

```bash
# Validate without executing
agentuity deployment list --count=50 --validate
echo $?  # 0 = valid, 2 = validation error

# Get validation errors as JSON
agentuity deployment list --count=invalid --validate --json
```

Output:

```json
{
	"valid": false,
	"command": "deployment list",
	"errors": [{ "field": "count", "message": "Expected number, received string" }]
}
```

### Exit Codes for Error Handling

The CLI uses standard exit codes for programmatic error detection:

- `0` - Success
- `1` - General error
- `2` - Validation error (invalid arguments/options)
- `3` - Authentication error (login required)
- `4` - Resource not found
- `5` - Permission denied
- `6` - Network error (API unreachable)
- `7` - File system error
- `8` - User cancelled

**Example - Robust error handling:**

```bash
agentuity deployment list --json
EXIT_CODE=$?

if [ $EXIT_CODE -eq 3 ]; then
  # Auth required - login first
  agentuity auth login
  # Retry the command
  agentuity deployment list --json
elif [ $EXIT_CODE -eq 4 ]; then
  echo "No deployments found"
elif [ $EXIT_CODE -eq 0 ]; then
  echo "Success!"
fi
```

### Machine-Readable Output

**JSON Mode** - All commands support `--json` for structured output:

```bash
agentuity project list --json
```

```json
{
	"success": true,
	"data": [{ "id": "proj_123", "name": "My Project", "orgId": "org_456" }],
	"metadata": {
		"timestamp": "2025-11-21T05:12:11.122Z",
		"executionTime": "245ms"
	}
}
```

**Quiet Mode** - Suppress non-essential output:

```bash
agentuity deployment list --quiet --json
```

**Disable Progress** - Turn off spinners for CI/CD:

```bash
agentuity deploy --no-progress
```

### Idempotency for Retry Logic

Commands are marked as idempotent (safe to retry) or non-idempotent:

**Idempotent (48 commands):**

- All read-only operations (list, get, show, stats, search)
- Set operations (overwrites are idempotent)
- Delete operations (deleting non-existent is idempotent)

**Non-idempotent (25 commands):**

- Create operations (may create duplicates)
- Deploy operations (creates new deployment each time)
- Login/logout (session state changes)

**Example - Safe retry pattern:**

```bash
# Check if command is safe to retry
IS_IDEMPOTENT=$(jq '.commands[] | .. | select(.name=="deployment" and .idempotent?==true)' schema.json)

# Retry idempotent commands on failure
for i in {1..3}; do
  agentuity secret set DATABASE_URL "postgres://..." && break
  sleep 2
done
```

### Command Prerequisites

Some commands have dependencies documented in the schema:

```bash
# Check what must run first
jq '.commands[] | .. | select(.prerequisites?) | {name, prerequisites}' schema.json
```

**Example dependencies:**

- `deployment show` requires `cloud deploy` first
- `secret push` requires `secret set` first
- `ssh` requires active deployment

### Batch Operation Handling

Commands that process multiple items provide structured failure reporting:

```json
{
	"success": false,
	"totalItems": 3,
	"succeeded": 2,
	"failed": 1,
	"results": [
		{ "item": "secret1", "success": true },
		{ "item": "secret2", "success": false, "error": { "code": "...", "message": "..." } },
		{ "item": "secret3", "success": true }
	]
}
```

### Explain Mode

Preview what a command will do without executing:

```bash
agentuity deploy --explain
```

Output shows:

- Steps that will be executed
- Resources that will be created/modified
- Estimated execution time
- Prerequisites that must be met

### Best Practices for Agents

1. **Discover before executing** - Always check schema for command capabilities
2. **Validate arguments** - Use `--validate` to test before running
3. **Handle errors programmatically** - Check exit codes, not error messages
4. **Use JSON mode** - Always use `--json` for machine-readable output
5. **Respect idempotency** - Only retry idempotent commands on failure
6. **Check prerequisites** - Verify dependencies are met before running
7. **Filter by tags** - Use tags to identify safe vs. destructive commands
8. **Disable interactivity** - Use `--quiet` and `--no-progress` in automation
9. **Parse response schemas** - Use JSON Schema to validate and parse responses
10.   **Batch carefully** - Handle partial failures in batch operations

### Common Patterns

**Safe command discovery:**

```bash
# Find all fast, read-only commands
jq '.commands[] | .. | select(.tags? and (.tags | contains(["read-only", "fast"])))' schema.json
```

**Validation before execution:**

```bash
# Validate first, execute second
agentuity deployment list --count=50 --validate && \
agentuity deployment list --count=50 --json
```

**Robust deployment:**

```bash
# Check schema for prerequisites
PREREQS=$(jq -r '.commands[] | .. | select(.name=="deploy") | .prerequisites[]?' schema.json)

# Run prerequisites
agentuity bundle

# Deploy with error handling
agentuity deploy --json
if [ $? -eq 0 ]; then
  echo "Deployment successful"
else
  echo "Deployment failed - check logs"
fi
```

**Response parsing:**

```bash
# Get response schema
SCHEMA=$(jq '.commands[] | .. | select(.name=="list") | .response' schema.json)

# Execute command and validate response against schema
RESPONSE=$(agentuity project list --json)
echo "$RESPONSE" | jq -e '.success' > /dev/null && echo "Valid response"
```

## Architecture

- **Runtime**: Bun server runtime
- **Framework**: Hono (lightweight web framework)
- **Build tool**: `@agentuity/cli` compiles to `.agentuity/` directory
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
│       ├── App.tsx      # Main React component
│       ├── frontend.tsx # React wrapper
│       └── index.html   # HTML index page
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
import { type AgentContext, createAgent } from '@agentuity/runtime';
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
		ctx.logger.info('Processing message: %s', input.message);

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
import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import agent from './agent';

const router = createRouter();

// GET endpoint
router.get('/', async (c) => {
	const result = await c.agent.myAgent.run({ message: 'Hello!' });
	return c.json(result);
});

// POST endpoint with validation
router.post('/', zValidator('json', agent.inputSchema!), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.myAgent.run(data);
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
- `ctx.waitUntil()` - Defer cleanup tasks or run async background tasks

## Adding API Routes

Create custom routes in `src/apis/`:

```typescript
// src/apis/my-route/route.ts
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	const result = await c.agent.hello('hi');
	return c.json({ result, status: 'ok' });
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
AGENTUITY_SDK_KEY=your-api-key
DATABASE_URL=your-database-url
```

Access them in your code:

```typescript
const apiKey = process.env.DATABASE_URL;
```

## Deployment

Build for production:

```bash
bun run build
```

The compiled application will be in `.agentuity/`.

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Zod Documentation](https://zod.dev/)
