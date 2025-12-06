# Integration Suite - Agent Guidelines

## Overview

This is a comprehensive integration test suite for the Agentuity SDK. It runs continuously as a single server instance on port 3500, executing tests via HTTP/SSE endpoints with real-time streaming results.

**Location**: `sdk/apps/testing/integration-suite/`

## Commands

- **Build**: `bun run build` - Bundles the app to `.agentuity/`
- **Typecheck**: `bun run typecheck` - Runs TypeScript validation
- **Run Server**: `cd .agentuity && bun run app.js` - Starts test server on port 3500
- **Run Tests**: `curl http://localhost:3500/api/test/run?suite=<name>&concurrency=10`

## Architecture

### Test Execution Model

- **Single Server**: App starts once, stays running, executes tests on demand
- **SSE Streaming**: `GET /api/test/run` streams real-time test results
- **Query Parameters**:
   - `suite=<name>` - Filter by suite name
   - `test=<name>` - Filter by test name
   - `concurrency=<number>` - Parallel execution (default: 10)
- **Event Types**: `start`, `progress`, `complete`
- **Concurrent Execution**: Tests run in parallel with Promise.allSettled for resilience
- **Isolation**: Each test uses `uniqueId()` for unique keys/namespaces to prevent cross-contamination

### Directory Structure

```
integration-suite/
├── src/
│   ├── agent/                  # All test agents
│   │   ├── basic/             # Basic agent tests
│   │   ├── routing/           # HTTP routing tests
│   │   ├── storage/           # Storage service tests
│   │   │   ├── kv/           # KeyValue storage
│   │   │   ├── stream/       # Stream storage
│   │   │   └── vector/       # Vector storage
│   │   └── session/          # Session/thread tests
│   ├── test/                  # Test definitions
│   │   ├── suite.ts          # TestSuite class
│   │   ├── helpers/          # Test utilities
│   │   │   ├── index.ts      # Assertions, uniqueId
│   │   │   └── kv.ts         # KV-specific helpers
│   │   ├── basic-agents.ts   # Basic agent tests
│   │   ├── routing-agents.ts # Routing tests
│   │   ├── storage-kv.ts     # KV tests
│   │   ├── storage-stream.ts # Stream tests
│   │   ├── storage-vector.ts # Vector tests
│   │   └── session-basic.ts  # Session/thread tests
│   └── api/                   # API routes
│       └── index.ts          # Test execution API
├── app.ts                     # Main entry point
├── package.json
├── tsconfig.json             # Path aliases configured
└── agentuity.json
```

### Path Aliases

**ALWAYS use path aliases for imports:**

```typescript
// ✅ CORRECT
import myAgent from '@agents/storage/kv/crud';
import { test } from '@test/suite';

// ❌ WRONG
import myAgent from '../agent/storage/kv/crud';
import { test } from './suite';
```

**Configured in tsconfig.json**:

```json
{
	"compilerOptions": {
		"paths": {
			"@agents/*": ["./src/agent/*"],
			"@test/*": ["./src/test/*"]
		}
	}
}
```

### Nested Directory Structure

**Agents CAN and SHOULD use nested directories for logical organization:**

```
src/agent/
├── basic/           # Grouped by feature
│   ├── basic-simple.ts
│   └── basic-async.ts
└── storage/         # Nested grouping
    ├── kv/
    │   ├── crud.ts
    │   └── types.ts
    └── stream/
        ├── crud.ts
        └── metadata.ts
```

**Important**: We fixed a bundler bug in `sdk/packages/cli/src/cmd/build/plugin.ts` (line 418) that prevented nested directories. The fix checks if a directory OR any subdirectory contains agents (recursive check with `startsWith`).

## Test Patterns

### Test Registration

Tests are registered with the `test()` function from `@test/suite`:

```typescript
import { test } from '@test/suite';
import { assertEqual, assertDefined } from '@test/helpers';
import myAgent from '@agents/my-agent';

test('suite-name', 'test-name', async () => {
	const result = await myAgent.run({ input: 'data' });
	assertEqual(result.success, true);
});
```

### Agent Execution

**ALWAYS use `agent.run()` - NOT `agent.handler()`:**

```typescript
// ✅ CORRECT - Provides full context automatically
const result = await myAgent.run({ input: 'data' });

// ❌ WRONG - Requires manual context creation
await myAgent.handler(ctx, { input: 'data' });
```

### Test Isolation

**Use `uniqueId()` for all keys, namespaces, and identifiers:**

```typescript
import { uniqueId } from '@test/helpers';

test('storage-kv', 'set', async () => {
	const key = uniqueId('kv-set'); // e.g., "kv-set-1733501234567-abc123"
	const namespace = uniqueId('ns'); // e.g., "ns-1733501234567-def456"

	await kvAgent.run({ operation: 'set', key, namespace, value: 'data' });
});
```

### Test File Structure

```typescript
/**
 * Test Suite Name
 *
 * Description of what this suite tests
 */

import { test } from '@test/suite';
import { assert, assertEqual, assertDefined, uniqueId } from '@test/helpers';
import agent1 from '@agents/category/agent1';
import agent2 from '@agents/category/agent2';

// Test: Description
test('suite-name', 'test-name', async () => {
	// Setup
	const key = uniqueId('test');

	// Execute
	const result = await agent1.run({ operation: 'action', key });

	// Assert
	assertEqual(result.success, true);
	assertDefined(result.data);
});
```

### Assertions Available

```typescript
import {
	assert, // assert(condition, message)
	assertEqual, // assertEqual(actual, expected, message?)
	assertDeepEqual, // assertDeepEqual(actual, expected, message?)
	assertDefined, // assertDefined(value, message?)
	assertTruthy, // assertTruthy(value, message?)
	assertFalsy, // assertFalsy(value, message?)
	assertThrows, // assertThrows(fn, message?)
	uniqueId, // uniqueId(prefix?) - Generate unique ID
} from '@test/helpers';
```

## SDK API Learnings

### KeyValue Storage

**API**: `ctx.kv.set()`, `ctx.kv.get()`, `ctx.kv.delete()`, `ctx.kv.has()`

**Important Patterns**:

```typescript
// Method signatures
await ctx.kv.set(namespace, key, value, params?);
const result = await ctx.kv.get<T>(namespace, key);  // Returns DataResult
await ctx.kv.delete(namespace, key);

// DataResult structure
interface DataResult<T> {
  exists: boolean;
  data?: T;
  contentType?: string;
}

// Usage
const result = await ctx.kv.get<string>('namespace', 'key');
if (result.exists) {
  console.log(result.data);  // Type-safe!
}
```

**Gotchas**:

- Values are stored as `Uint8Array` and returned stringified after `agent.run()` JSON serialization
- Use `decodeKVValue()` helper from `@test/helpers/kv` to decode stringified Uint8Arrays
- Object storage requires explicit `contentType: 'application/json'` parameter
- Object serialization through `agent.run()` is complex - test in unit tests instead

### Stream Storage

**API**: `ctx.stream.create()`, `stream.write()`, `stream.close()`, `stream.getReader()`, `ctx.stream.download()`, `ctx.stream.list()`

**Important Patterns**:

```typescript
// Create, write, close pattern
const stream = await ctx.stream.create(name, {
	contentType: 'text/plain',
	metadata: { key: 'value' },
});
await stream.write('data');
await stream.close();

// Read back
const reader = stream.getReader();
const chunks: Uint8Array[] = [];
for await (const chunk of reader as any) {
	chunks.push(chunk);
}

// Download by ID
const readable = await ctx.stream.download(streamId);

// List streams
const result = await ctx.stream.list({
	name: 'filter',
	metadata: { key: 'value' },
	limit: 100,
	offset: 0,
});
```

**Gotchas**:

- Must `close()` stream before reading
- ReadableStream iteration requires `for await (const chunk of stream)` pattern
- Chunks must be accumulated into single Uint8Array and decoded with TextDecoder
- Content types preserved: `text/plain`, `application/octet-stream`, `application/json`
- `stream.getReader()` vs `ctx.stream.download(id)` - reader for same stream, download for stored stream

### Vector Storage

**API**: `ctx.vector.upsert()`, `ctx.vector.search()`, `ctx.vector.get()`, `ctx.vector.getMany()`, `ctx.vector.delete()`, `ctx.vector.exists()`

**Important Patterns**:

```typescript
// Upsert with document text (auto-embedded)
const results = await ctx.vector.upsert(namespace,
  { key: 'doc1', document: 'Text to embed', metadata: { category: 'tech' } }
);

// Upsert with pre-computed embeddings
await ctx.vector.upsert(namespace,
  { key: 'doc2', embeddings: [0.1, 0.2, ...], metadata: { type: 'manual' } }
);

// Semantic search
const results = await ctx.vector.search(namespace, {
  query: 'natural language query',
  limit: 10,
  similarity: 0.7,  // 0.0-1.0, higher = more similar
  metadata: { category: 'tech' }  // Filter by metadata
});

// Get by key
const result = await ctx.vector.get(namespace, key);
if (result.exists) {
  console.log(result.data);  // VectorSearchResultWithDocument
}

// Delete
const deletedCount = await ctx.vector.delete(namespace, ...keys);
```

**Gotchas**:

- Upsert accepts either `document` (string) OR `embeddings` (number[]), not both
- Search uses natural language queries with automatic embedding
- Similarity threshold is 0.0-1.0 (1.0 = exact match)
- Get/getMany return `VectorResult` with `exists` field for type safety
- Delete returns count of deleted vectors

### Session & Thread

**API**: `ctx.session.id`, `ctx.session.state`, `ctx.thread.id`, `ctx.thread.state`, `ctx.session.addEventListener()`, `ctx.thread.addEventListener()`

**Important Patterns**:

```typescript
// Access IDs
const sessionId = ctx.session.id; // sess_*
const threadId = ctx.thread.id; // thrd_*

// Session state (scoped to request)
ctx.session.state.set('key', 'value');
const value = ctx.session.state.get('key');

// Thread state (persists across sessions)
ctx.thread.state.set('conversationCount', 5);
const count = ctx.thread.state.get('conversationCount');

// Event listeners
ctx.session.addEventListener('completed', (eventName, session) => {
	console.log('Session completed:', session.id);
});

ctx.thread.addEventListener('destroyed', (eventName, thread) => {
	console.log('Thread destroyed:', thread.id);
});

// Thread operations
const isEmpty = ctx.thread.empty(); // Check if thread has data
await ctx.thread.destroy(); // Manually destroy thread
```

**Gotchas**:

- **`agent.run()` shares session context** - all calls in same test use same session/thread
- Session IDs start with `sess_`, thread IDs start with `thrd_`
- Session state is Map<string, unknown> scoped to the session (request-level)
- Thread state persists across sessions within same thread (conversation-level)
- Event listeners: `'completed'` for session, `'destroyed'` for thread
- State persistence within shared context (not isolated per agent call in tests)

### Error Handling & StructuredError

**API**: `StructuredError(tag, message?)<{ shape }>()`

**Important Patterns**:

```typescript
import { StructuredError } from '@agentuity/core';

// Define custom error with shape
const ValidationError = StructuredError('ValidationError', 'Validation failed')<{
	field: string;
	reason: string;
}>();

const NotFoundError = StructuredError('NotFoundError', 'Resource not found')<{
	resource: string;
	id: string;
}>();

// Throw with data
throw new ValidationError({ field: 'email', reason: 'Invalid format' });

// Try-catch in handler
try {
	throw new ValidationError({ field: 'age', reason: 'Must be positive' });
} catch (error) {
	ctx.logger.warn('Validation failed', { error });
	return { success: false, message: 'Handled error' };
}

// Access properties directly on error instance
const error = new ValidationError({ field: 'name', reason: 'Required' });
console.log(error.field); // 'name' - NOT error.data.field
console.log(error.reason); // 'Required'
```

**Gotchas**:

- StructuredError properties are directly on the error instance (not nested in `.data` property)
- Pattern: `StructuredError(tag, defaultMessage)<{ shape }>()` - note the two call signatures
- Schema validation errors are automatically thrown by the runtime
- Try-catch in agent handlers allows graceful error handling
- Errors can be caught and transformed into success responses with error details

### Eval Framework

**API**: `agent.createEval(name, config)`

**Important Patterns**:

```typescript
import { createAgent } from '@agentuity/runtime';

const myAgent = createAgent('my-agent', {
	schema: {
		input: s.object({ value: s.number() }),
		output: s.object({ result: s.number() }),
	},
	handler: async (ctx, input) => {
		return { result: input.value * 2 };
	},
});

// Create eval with binary pass/fail
myAgent.createEval('check-positive', {
	description: 'Ensures result is greater than zero',
	handler: async (ctx, input, output) => {
		return {
			success: true,
			passed: output.result > 0,
			metadata: {
				reason: output.result > 0 ? 'Pass' : 'Fail',
			},
		};
	},
});

// Create eval with score (0.0-1.0)
myAgent.createEval('accuracy-score', {
	description: 'Scores accuracy of result',
	handler: async (ctx, input, output) => {
		const expected = input.value * 2;
		const accuracy = output.result === expected ? 1.0 : 0.0;

		return {
			success: true,
			score: accuracy,
			metadata: {
				reason: `Expected ${expected}, got ${output.result}`,
			},
		};
	},
});
```

**Gotchas**:

- Evals run automatically on every agent execution
- Eval result format requires `success: true` and `metadata: { reason, ... }`
- Binary results use `passed: boolean`
- Score results use `score: number` (0.0-1.0 range)
- Eval handler receives: `(ctx, input, output)` for agents with input/output
- Evals are executed in production and logged with structured telemetry
- Multiple evals can be attached to a single agent

### Schema Validation

**API**: Schema types from `@agentuity/schema`

**Important Patterns**:

```typescript
import { s } from '@agentuity/schema';

// Basic types
s.string();
s.number();
s.boolean();
s.any();

// Optional fields
s.string().optional();
s.number().optional();

// Arrays
s.array(s.string());
s.array(s.object({ id: s.string(), count: s.number() }));

// Objects
s.object({
	name: s.string(),
	age: s.number(),
	active: s.boolean().optional(),
});

// Nested objects
s.object({
	user: s.object({
		profile: s.object({
			email: s.string(),
		}),
	}),
});

// Union types
s.union(s.string(), s.number());
s.union(s.string(), s.boolean(), s.null());

// Record (dynamic keys)
s.record(s.string(), s.any());
s.record(s.string(), s.number());
```

**Gotchas**:

- Default values: Handle in destructuring (e.g., `{ field = defaultValue } = input`)
- Union types take multiple args, not an array: `s.union(a, b)` not `s.union([a, b])`
- Record types need two args: `s.record(keyType, valueType)` not `s.record(valueType)`
- Validation happens automatically before handler is called
- Missing required fields throw validation errors
- Wrong types throw validation errors
- Nested objects are fully supported (unlimited depth)

### WaitUntil & Background Tasks

**API**: `ctx.waitUntil(promise | function)`

**Important Patterns**:

```typescript
// Schedule async background task
ctx.waitUntil(async () => {
	await someAsyncWork();
	ctx.logger.info('Background work complete');
});

// Schedule promise-based task
ctx.waitUntil(
	someAsyncOperation().then(() => {
		ctx.logger.info('Promise-based task complete');
	})
);

// Schedule synchronous function
ctx.waitUntil(() => {
	ctx.logger.info('Sync task complete');
});

// Multiple tasks
ctx.waitUntil(task1());
ctx.waitUntil(task2());
ctx.waitUntil(task3());
```

**Gotchas**:

- Background tasks execute **after** the response is sent to the client
- Main request succeeds even if background task throws an error
- Errors in background tasks are logged but don't affect response
- Can call `waitUntil()` multiple times within a single agent execution
- **Limitation in tests**: Once `waitUntilAll()` is called (after agent completes), cannot call `waitUntil()` again in shared session context
- Use for cleanup, logging, analytics, or async operations that don't block response

### Event System

**API**: `agent.addEventListener()`, `ctx.session.addEventListener()`, `ctx.thread.addEventListener()`, `removeEventListener()`

**Important Patterns**:

```typescript
// Agent event listeners
agent.addEventListener('started', (eventName, agent, ctx) => {
	console.log(`${agent.metadata.name} started`);
});

agent.addEventListener('completed', (eventName, agent, ctx) => {
	console.log(`${agent.metadata.name} completed`);
});

agent.addEventListener('errored', (eventName, agent, ctx, error) => {
	console.error(`${agent.metadata.name} failed:`, error.message);
});

// Session event listeners (inside handler)
ctx.session.addEventListener('completed', (eventName, session) => {
	console.log(`Session ${session.id} completed`);
});

// Thread event listeners (inside handler)
ctx.thread.addEventListener('destroyed', (eventName, thread) => {
	console.log(`Thread ${thread.id} destroyed`);
});

// Remove event listener
const listener = (eventName, agent, ctx) => {
	/* ... */
};
agent.addEventListener('started', listener);
agent.removeEventListener('started', listener);

// Multiple listeners for same event
agent.addEventListener('started', listener1);
agent.addEventListener('started', listener2);
agent.addEventListener('started', listener3);
```

**Available Events**:

- **Agent Events**: `'started'`, `'completed'`, `'errored'`
- **Session Events**: `'completed'`
- **Thread Events**: `'destroyed'`

**Gotchas**:

- Event listeners registered during handler execution may not fire for current execution
- `started` event fires before handler runs, so listeners added in handler won't catch it
- Session `completed` event fires after response is sent
- Thread `destroyed` event only fires when `ctx.thread.destroy()` is called
- Event listener callbacks can be async (return Promise<void> or void)
- Multiple listeners for same event all fire in registration order
- Use `removeEventListener()` with exact same function reference to remove

## Schema Patterns

### Common Mistakes

```typescript
// ❌ WRONG - s.record() requires TWO arguments
s.record(s.string());

// ✅ CORRECT
s.record(s.string(), s.string()); // key type, value type

// ❌ WRONG - s.union() takes args, not array
s.union([s.string(), s.number()]);

// ✅ CORRECT
s.union(s.string(), s.number());
```

### Agent Schema Pattern

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const myAgent = createAgent('my-agent-name', {
	description: 'What this agent does',
	schema: {
		input: s.object({
			operation: s.string(),
			key: s.string().optional(),
			value: s.any().optional(),
		}),
		output: s.object({
			success: s.boolean(),
			data: s.any().optional(),
		}),
	},
	handler: async (ctx, input) => {
		// Handler logic
		return { success: true };
	},
});

export default myAgent;
```

## Web Dashboard

The integration suite includes a React-based web dashboard for running and visualizing tests.

**Access**: Start the server and navigate to `http://localhost:3500/`

**Features**:

- View all test suites and tests organized hierarchically
- Run individual tests, entire suites, or all tests
- Real-time streaming of test results via SSE
- Visual indicators for pass/fail status
- Error messages and stack traces for failures
- Test duration tracking
- Summary statistics (total, passed, failed, duration)

**Implementation**:

- Dashboard: `src/web/index.html` - Single HTML file with embedded React
- API endpoint: `GET /api/test/list` - Returns grouped test suites
- SSE endpoint: `GET /api/test/run` - Streams test execution results
- Styling: TailwindCSS via CDN
- React: Loaded via CDN (development build for debugging)

**File Structure**:

```
src/web/
└── index.html    # React dashboard (auto-served at /)
```

## Development Workflow

### Adding New Tests

1. **Create Agent(s)**: Add to `src/agent/<category>/` with logical grouping
2. **Create Test File**: Add to `src/test/` with descriptive name
3. **Import Tests**: Add import to `app.ts` to register tests
4. **Verify**: Run typecheck, build, and tests
5. **View in Dashboard**: Open http://localhost:3500/ to see and run tests

```bash
# Typecheck
bun run typecheck

# Build
bun run build

# Start server
cd .agentuity && bun run app.js &

# Run specific suite
curl "http://localhost:3500/api/test/run?suite=storage-kv"

# Run all tests
curl "http://localhost:3500/api/test/run?concurrency=10"
```

### Running Tests

```bash
# Start server in background
cd .agentuity && bun run app.js 2>&1 &
APP_PID=$!
sleep 5

# Run tests via curl
curl -s "http://localhost:3500/api/test/run?concurrency=10" | grep -E '(event:|summary)'

# Kill server
kill $APP_PID
```

### Test Output Format

**SSE Events**:

```
event: start
data: {"type":"start","total":65}

event: progress
data: {"type":"progress","test":"suite:test-name","passed":true,"duration":5.2}

event: complete
data: {"type":"complete","summary":{"total":65,"passed":65,"failed":0,"duration":369.2}}
```

## Common Patterns

### Handling Async Iterations

```typescript
// Reading streams/readers
const chunks: Uint8Array[] = [];
for await (const chunk of reader as any) {
	chunks.push(chunk);
}

// Combine chunks
const combinedChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
let offset = 0;
for (const chunk of chunks) {
	combinedChunks.set(chunk, offset);
	offset += chunk.length;
}

// Decode to string
const text = new TextDecoder().decode(combinedChunks);
```

### Agent Variable Naming

Each agent export must have a unique variable name:

```typescript
// ✅ CORRECT
const kvCrudAgent = createAgent('storage-kv-crud', { ... });
const streamCrudAgent = createAgent('storage-stream-crud', { ... });

// ❌ WRONG - collision!
const agent = createAgent('storage-kv-crud', { ... });
const agent = createAgent('storage-stream-crud', { ... });
```

### Multiple Operations in One Agent

```typescript
const myAgent = createAgent('my-agent', {
	schema: {
		input: s.object({
			operation: s.string(), // Switch on this
			// ... operation-specific fields
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			// ... operation-specific results
		}),
	},
	handler: async (ctx, input) => {
		const { operation } = input;

		switch (operation) {
			case 'create':
				// Handle create
				return { operation, success: true };

			case 'delete':
				// Handle delete
				return { operation, success: true };

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});
```

## Debugging

### Enable Verbose Output

```bash
# Check what tests are registered
curl "http://localhost:3500/api/test/list"

# Get all suite names
curl "http://localhost:3500/api/test/suites"

# Run specific test
curl "http://localhost:3500/api/test/run?suite=storage-kv&test=set"
```

### Common Issues

**Tests not appearing**:

- Check that test file is imported in `app.ts`
- Verify `test()` function is called (not just defined)
- Rebuild: `bun run build`

**Agent not found**:

- Check path alias usage (`@agents/` prefix)
- Verify agent is exported as default
- Rebuild to regenerate registry

**Type errors**:

- Run `bun run typecheck` to see all errors
- Check schema definitions match usage
- Verify import paths are correct

## Test Coverage

As of Phase 8 completion:

- **125 total tests** across 12 suites
- **8 basic agent tests** - Core agent functionality
- **12 routing tests** - HTTP methods, params, headers
- **10 KV storage tests** - CRUD, types, concurrent ops
- **12 stream storage tests** - Create, write, read, metadata
- **12 vector storage tests** - Upsert, search, filters
- **11 session tests** - IDs, state, events, persistence
- **6 waitUntil tests** - Background task scheduling
- **15 error handling tests** - Validation errors, StructuredError, propagation
- **15 schema validation tests** - Types, optional fields, nested objects, unions, arrays
- **5 eval framework tests** - Eval creation, execution, scoring
- **8 event system tests** - Agent/session/thread events, listeners, removal
- **11 server resilience tests** - Error handling, crash prevention, fault tolerance

**Execution Time**: ~475ms for all 125 tests with concurrency 10

## Key Learnings Summary

1. **Path Aliases**: Always use `@agents/*` and `@test/*` - never relative paths
2. **Nested Directories**: Fully supported after bundler fix - organize logically
3. **Test Isolation**: Use `uniqueId()` for all keys/namespaces to prevent cross-contamination
4. **Agent Execution**: Always use `agent.run()`, never `agent.handler()`
5. **Session Context**: `agent.run()` shares session/thread context across all calls in same test
6. **Schema Gotchas**: `s.record(k, v)` needs 2 args, `s.union(a, b)` takes args not array
7. **API Naming**: `ctx.stream` not `ctx.streams`, `ctx.kv`, `ctx.vector` (singular)
8. **Type Safety**: Use `exists` field checks for KV/Vector results
9. **Streaming**: Must accumulate chunks and decode with TextDecoder
10.   **No Debug Logs**: Don't add `console.log` to production code - removed from app.ts
11.   **WaitUntil**: Background tasks run after response; errors don't fail request; can't call after waitUntilAll
12.   **StructuredError**: Pattern is `StructuredError(tag, message)<{ shape }>()` - properties on error instance
13.   **Eval Results**: Require `success: true`, `metadata: { reason }`, plus `passed` or `score`
14.   **Event System**: Agent events (`started`, `completed`, `errored`), session events (`completed`), thread events (`destroyed`); listeners registered during handler may not fire for current execution; use `removeEventListener()` with same function reference

## Future Enhancements

- [ ] Add Phase 3.2: Thread Management Tests (thread persistence across requests)
- [ ] Add Phase 4: Lifecycle & Hooks Tests (waitUntil, app hooks)
- [ ] Add Phase 5: Error Handling Tests (validation, structured errors)
- [ ] Add Phase 6: Communication Tests (email, SMS, events, WebSocket, SSE)
- [ ] Add Phase 7: Advanced Tests (evals, workbench components)
- [ ] Performance benchmarking suite
- [ ] CI/CD integration with automated test runs
- [ ] HTML report generation
