# Agent Guidelines for Agentuity TypeScript Monorepo

## Commands

- **Build**: `bun run build` (root), individual packages: `cd packages/<name> && bun run build`
- **Typecheck**: `bun run typecheck` (root), individual: `bunx tsc --noEmit` in package dir
- **Lint**: `bun run lint`
- **Format**: `bun run format`
- **Test**: `bun run test` (prefer over Bun's built-in test runner to pick up other test scripts)
- **Clean**: `bun run clean` (removes all dist/ and .tsbuildinfo files)
- **Test Everything**: `bun run all` will run all the commands together to validate and test

## Architecture

- **Monorepo**: Bun workspaces with 7 packages in `packages/`: `core`, `react`, `runtime`, `server`, `cli`, `workbench`, `test-utils`
- **@agentuity/core**: Shared utilities and schemas, foundation for other packages
- **@agentuity/react**: Browser-only React components, depends on core
- **@agentuity/runtime**: Bun server runtime using Hono framework, depends on core
- **@agentuity/server**: Runtime-agnostic server utilities for Node.js and Bun, depends on core
- **@agentuity/schema**: Schema validation library similar to zod
- **@agentuity/workbench**: The workbench React component
- **@agentuity/cli**: Bun-native CLI framework with commander.js, auto-discovery, and YAML config
- **@agentuity/test-utils**: Private test utilities package (never published), provides shared test helpers
- **Cross-package imports**: Use workspace protocol `@agentuity/<package>` in package.json dependencies
- **Test Apps**: The `apps/testing` folder contains multiple test applications
- **Profile-based config**: Project configs support profile overrides via `agentuity.[PROFILE].json` (e.g., `agentuity.production.json`). If the profile-specific file exists and matches the active profile name, it takes precedence over `agentuity.json`

## Code Style

- **Formatter**: Prettier with tabs (width 3), single quotes, semicolons, 100 char line width
- **TypeScript**: Strict mode, ESNext target, bundler moduleResolution, composite project references
- **Linter**: ESLint with TypeScript, React, and JSON support
- **Naming**: Export all public APIs from package `index.ts`, use named exports
- **Build targets**: `react` = browser, `runtime` = bun runtime, `server` = node/bun agnostic

## Special Instructions

- **Verification Required**: DO NOT commit files until format, lint, typecheck, build and test cases ALL pass
- **Main**: NEVER commit directly to the main branch

## Testing Standards

### Test Organization

All tests MUST be in `test/` folder parallel to `src/` folder:

```
packages/example/
├── src/                # Source code
├── test/               # ALL tests here
│   ├── foo.test.ts
│   └── bar.test.ts
├── tsconfig.json       # Main build (excludes test/)
└── tsconfig.test.json  # Test typecheck (includes test/ and src/)
```

**Never use:** `__tests__/`, `__test__/`, or `*.test.ts` files in `src/` folder.

### TypeScript Configuration

Each package needs TWO tsconfig files:

**tsconfig.json** (main build):

```json
{
	"include": ["src/**/*"],
	"exclude": ["test/**/*"]
}
```

**tsconfig.test.json** (test typecheck):

```json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"composite": false,
		"outDir": "./dist-test",
		"rootDir": ".",
		"types": ["bun-types"]
	},
	"include": ["test/**/*", "src/**/*"],
	"references": [{ "path": "../dependency" }]
}
```

### Test Import Paths

Tests in `test/` folder must import from `../src/`:

```typescript
// ✅ CORRECT
import { myFunction } from '../src/myModule';

// ❌ WRONG (only works when tests were in src/)
import { myFunction } from '../myModule';
```

### Shared Test Utilities

Use `@agentuity/test-utils` for reusable test helpers:

```typescript
import { createMockLogger, mockFetch, createMockAdapter } from '@agentuity/test-utils';
```

Add to package.json devDependencies:

```json
{
	"devDependencies": {
		"@agentuity/test-utils": "workspace:*"
	}
}
```

**Available helpers:**

- `createMockLogger()` - Mock Logger instance
- `mockFetch(fn)` - Mock globalThis.fetch (handles Bun type issues)
- `createMockAdapter(responses)` - Mock FetchAdapter for service testing

### Testing Workflow

1. Create test file in `test/` folder
2. Import from `../src/`
3. Use helpers from `@agentuity/test-utils`
4. Run `bun test` to verify
5. Run `bunx tsc --project tsconfig.test.json --noEmit` to typecheck
6. Run `bun run lint` to check for issues
7. **Fix ALL errors AND warnings before proceeding** (warnings = errors)

### Test Quality Requirements

Before any code is considered complete:

- ✅ 0 test failures
- ✅ 0 typecheck errors
- ✅ 0 typecheck warnings
- ✅ 0 lint errors
- ✅ 0 lint warnings

**No exceptions.** All warnings must be resolved.

### Type Helper Usage

Always use `InferInput` and `InferOutput` from `@agentuity/core`:

```typescript
// ✅ CORRECT
import type { InferInput, InferOutput } from '@agentuity/core';
type MyType = InferOutput<T>;

// ❌ WRONG
import type { StandardSchemaV1 } from '@agentuity/core';
type MyType = StandardSchemaV1.InferOutput<T>;
```

### StructuredError Pattern

StructuredError properties are directly on the error instance:

```typescript
// ✅ CORRECT
const error = new ServiceException({ statusCode: 500, method: 'GET', url: '...' });
expect(error.statusCode).toBe(500);
expect(error.method).toBe('GET');

// ❌ WRONG
expect(error.data.statusCode).toBe(500); // No .data property!
```

### Type Safety in Agent Tests (@agentuity/runtime)

**CRITICAL:** When testing agents and routes, do NOT add type annotations to handler parameters:

```typescript
// ✅ CORRECT: Let TypeScript infer types from agent schema
const agent = createAgent('user', {
  schema: {
    input: z.object({ name: z.string() }),
    output: z.object({ id: z.string() }),
  },
  handler: async (ctx, input) => {
    // ctx and input are fully typed from schema
    return { id: `user-${input.name}` };
  },
});

// ❌ WRONG: Explicit types defeat inference
handler: async (ctx: AgentContext, input: any) => { ... }
```

**For route testing**, use `app.request()` instead of Hono's `testClient()`:

```typescript
// ✅ CORRECT: Use app.request() for testing
const app = new Hono().post('/users', agent.validator(), async (c) => {
	const data = c.req.valid('json'); // Fully typed!
	return c.json({ id: `user-${data.name}` });
});

const res = await app.request('/users', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ name: 'Alice' }),
});

// ❌ AVOID: testClient has type inference issues with method-chained apps
import { testClient } from 'hono/testing';
const client = testClient(app); // Returns unknown
```

See `packages/runtime/TYPE_SAFETY.md` for detailed type safety documentation.

## Special Instructions

- **Documents**: Don't create summary documents UNLESS the user asks you to document it explicitly
- **Clarification**: If you're not 100% sure, ask the user to provide clarification before continuing - especially before making major code changes
- **Errors**: Always use the `StructuredError` in `@agentuity/core` to make Error classes with structured data
