# @agentuity/test-utils

**Internal test utilities package - not published to npm**

This package provides shared test helpers for use across Agentuity SDK packages to reduce duplication and ensure consistent testing patterns.

## Usage

Add as a devDependency in your package:

```json
{
	"devDependencies": {
		"@agentuity/test-utils": "workspace:*"
	}
}
```

Import in your tests:

```typescript
import { createMockLogger, mockFetch } from '@agentuity/test-utils';

// Use mock logger
const logger = createMockLogger();
someFunction(logger);
expect(logger.info).toHaveBeenCalled();

// Use mock fetch
mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
await fetch('https://api.example.com');
expect(globalThis.fetch as any).toHaveBeenCalled();
```

## Included Helpers

### `createMockLogger()`

Creates a mock `Logger` instance that silently captures all log calls for verification.

**Example:**

```typescript
const logger = createMockLogger();
someFunction(logger);
expect(logger.info).toHaveBeenCalled();
```

### `mockFetch(fn)`

Mocks `globalThis.fetch` with the provided function, handling Bun's type incompatibility.

**Example:**

```typescript
mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
await fetch('https://api.example.com');
expect(globalThis.fetch as any).toHaveBeenCalled();
```

### `createMockAdapter(responses, config?)`

Creates a mock `FetchAdapter` for testing service layer code. Allows simulating multiple responses in sequence and tracking all calls.

**Example:**

```typescript
const { adapter, calls } = createMockAdapter([
	{ ok: true, data: { id: 123 }, status: 200 },
	{ ok: false, status: 404 },
]);

const service = new KeyValueStorageService('https://api.example.com', adapter);
await service.get('key1'); // Returns { id: 123 }
await service.get('key2'); // Returns 404

expect(calls).toHaveLength(2);
expect(calls[0].url).toBe('https://api.example.com/...');
```

## Adding New Helpers

When you find test code duplicated across 2+ packages:

1. Add the helper to `src/`
2. Export it from `src/index.ts`
3. Update this README with usage examples

## Notes

- This package is marked `"private": true` and will never be published to npm
- Only available within the SDK monorepo workspace
- Used only in test files via devDependencies
- Not included in any production builds
