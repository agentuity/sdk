# Agent Guidelines for auth-app

## Commands

- **Build**: `bun run build` (runs bundler from parent monorepo)
- **Dev server**: `bun run dev` (runs built app from .agentuity/app.js)
- **Install**: `bun install`
- **Test**: `bun test` (runs integration tests)
- **Test Integration**: `bun test:integration` (integration tests only)
- **Test Legacy**: `bun test:legacy` (old shell scripts, deprecated)

## Architecture

- **Runtime**: Bun-based Agentuity server app using Hono framework
- **Structure**: Agent-based architecture with agents in `src/agent/<name>/`
- **Entry point**: app.ts creates server via `@agentuity/runtime`
- **Build output**: `.agentuity/` contains generated code (app.js, etc)
- **Agent pattern**: Each agent has `agent.ts` (handler + schema) and optional `route.ts` (HTTP routes)
- **Dependencies**: Uses Zod for validation, Hono for routing, @agentuity packages for framework

## Code Style

- **TypeScript**: Strict mode, ESNext target, bundler moduleResolution, allowImportingTsExtensions
- **Imports**: Use @agentuity/\* for framework imports, relative paths for local modules
- **Agents**: Export default agent from agent.ts, define Zod schemas for input/output
- **Routes**: Use createRouter() from @agentuity/runtime, access agents via c.agent.<name>.run()
- **Validation**: Use agent.validator() for request validation in route handlers
- **Naming**: Agent folders are lowercase, use camelCase for variables/functions

## Testing

This app provides **integration tests** for the Agentuity runtime. Most functionality is tested via **unit tests** in `sdk/packages/runtime/test/`.

### Test Structure

```
test/
├── helpers/
│   └── server.ts          # Server lifecycle utilities
└── integration/
    ├── server.test.ts     # Server lifecycle tests
    └── services.test.ts   # Service integration tests
```

### Integration Test Patterns

**Server lifecycle** - Tests real server startup/shutdown:

```typescript
beforeAll(async () => {
	await startTestServer(); // Auto-waits for health check
});

test('agent endpoint responds', async () => {
	const res = await request('/agent/simple');
	expect(res.status).toBe(200);
});
```

**Service integration** - Tests real storage services:

```typescript
test('KeyValue set and get', async () => {
	await jsonRequest('/agent/integration-test', {
		service: 'kv',
		operation: 'set',
		key: 'test',
		value: 'data',
	});

	const res = await jsonRequest('/agent/integration-test', {
		service: 'kv',
		operation: 'get',
		key: 'test',
	});

	expect((await res.json()).value).toBe('data');
});
```

### Manual Testing

For manual testing during development:

- **Start dev server**: `bun run dev`
- **Test endpoints**:
   - Health: `curl http://localhost:3500/health`
   - Simple agent: `curl http://localhost:3500/agent/simple`
   - With input: `curl http://localhost:3500/agent/simple --json '{"name":"Test","age":25}'`
   - Integration test: `curl http://localhost:3500/agent/integration-test --json '{"service":"kv","operation":"get","key":"test"}'`

### Legacy Shell Tests

Old shell-based tests are in `scripts/` and can be run with `bun test:legacy`. These are deprecated and will be removed after full migration to Bun tests.
