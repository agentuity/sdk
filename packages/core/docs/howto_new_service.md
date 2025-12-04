# How to Build a New Service Integration

This guide provides comprehensive instructions for implementing a new service integration in the Agentuity SDK. Service integrations provide type-safe, environment-agnostic access to Agentuity platform APIs.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Service Structure](#service-structure)
3. [Implementation Checklist](#implementation-checklist)
4. [Step-by-Step Guide](#step-by-step-guide)
5. [Utilities Reference](#utilities-reference)
6. [Best Practices](#best-practices)
7. [Examples](#examples)

## Architecture Overview

### The FetchAdapter Pattern

All services use the `FetchAdapter` interface to remain environment-agnostic. This allows services to run in different JavaScript environments (Bun, Node.js, browsers) without modification.

```typescript
interface FetchAdapter {
	invoke<T>(url: string, options: FetchRequest): Promise<FetchResponse<T>>;
}
```

**Current Adapters:**

- `ServerFetchAdapter` - For server-side environments (Bun, Node.js)
- Future: Browser adapters, edge runtime adapters, etc.

### Service Components

Each service integration consists of:

1. **TypeScript Interface** - Defines the public API contract
2. **Service Implementation** - Implements the interface using FetchAdapter
3. **Type Definitions** - Request/response types and parameters
4. **Error Handling** - Consistent error handling via ServiceException

## Service Structure

### File Organization

```
src/services/
├── __test__/           # Test files directory
│   ├── mock-adapter.ts    # Shared mock adapter helper
│   ├── keyvalue.test.ts   # KeyValueStorage tests
│   ├── stream.test.ts     # StreamStorage tests
│   └── yourservice.test.ts # Your service tests
├── adapter.ts          # FetchAdapter interface and types
├── exception.ts        # ServiceException class
├── server.ts           # ServerFetchAdapter implementation
├── _util.ts            # Shared utilities
├── yourservice.ts      # Your new service
└── index.ts            # Export all services
```

### Naming Conventions

- **Interface**: `{ServiceName}` or `{ServiceName}API`
   - Examples: `StreamStorage`, `KeyValueStorage`
- **Implementation Class**: `{ServiceName}Service`
   - Examples: `StreamAPIService`, `KeyValueStorageService`
- **File Name**: `yourservice.ts` (lowercase)
- **Telemetry Names**: `agentuity.{service}.{operation}`
   - Examples: `agentuity.stream.create`, `agentuity.keyvalue.get`

## Implementation Checklist

- [ ] Define TypeScript types for all request parameters
- [ ] Define TypeScript types for all response data
- [ ] Create the service interface with public methods
- [ ] Implement the service class extending the interface
- [ ] Add private `#adapter` and `#baseUrl` fields
- [ ] Implement constructor accepting `baseUrl` and `adapter`
- [ ] Add input validation for all public methods
- [ ] Use appropriate timeout values (10s for fast ops, 30s for longer)
- [ ] Include telemetry for all API calls
- [ ] Handle errors with `toServiceException()`
- [ ] Add JSDoc comments for all public APIs
- [ ] Export from `src/services/index.ts`
- [ ] Write tests in `src/services/__test__/yourservice.test.ts`
- [ ] Integrate into server package
- [ ] Integrate into cli package
- [ ] Create test agent in `test-app` for manual verification

## Step-by-Step Guide

### Step 1: Define Your Types

Start by defining the request and response types your service will use.

```typescript
// Request parameter types
export interface CreateWidgetParams {
	name: string;
	options?: {
		color?: string;
		size?: number;
	};
	ttl?: number;
}

export interface ListWidgetsParams {
	filter?: string;
	limit?: number;
	offset?: number;
}

// Response types
export interface Widget {
	id: string;
	name: string;
	createdAt: string;
	url: string;
}

export interface ListWidgetsResponse {
	success: boolean;
	widgets: Widget[];
	total: number;
}

// Result types (for operations that may not find data)
export interface WidgetResultFound {
	data: Widget;
	exists: true;
}

export interface WidgetResultNotFound {
	data: never;
	exists: false;
}

export type WidgetResult = WidgetResultFound | WidgetResultNotFound;
```

**Advanced: Discriminated Union Types for Either/Or Parameters**

Use discriminated unions when parameters are mutually exclusive:

```typescript
// Base interface with common properties
interface UploadBase {
	key: string;
	metadata?: Record<string, unknown>;
}

// Either upload from URL
interface UploadFromURL extends UploadBase {
	url: string;
	data?: never; // Explicitly mark as incompatible
}

// Or upload from data
interface UploadFromData extends UploadBase {
	data: Uint8Array;
	url?: never; // Explicitly mark as incompatible
}

// Union type - must be one or the other
export type UploadParams = UploadFromURL | UploadFromData;

// TypeScript will enforce that only one variant is used:
// ✅ { key: 'k1', url: 'https://...' }
// ✅ { key: 'k1', data: new Uint8Array() }
// ❌ { key: 'k1', url: 'https://...', data: new Uint8Array() }
```

**Advanced: Generic Type Parameters**

Use generics for type-safe metadata or filtering:

```typescript
export interface SearchParams<T extends Record<string, unknown> = Record<string, unknown>> {
	query: string;
	limit?: number;
	metadata?: T; // Type-safe metadata filtering
}

// Usage allows custom metadata types:
interface ProductMetadata {
	category: string;
	price: number;
}

const results = await service.search<ProductMetadata>('products', {
	query: 'laptop',
	metadata: { category: 'electronics', price: 999 }, // TypeScript validates this
});
```

**Internal vs Exported Types**

Keep API response wrapper types internal unless users need them:

```typescript
// ✅ EXPORT: Public types that users work with
export interface Widget {
	id: string;
	name: string;
}

export interface WidgetSearchParams {
	query: string;
	limit?: number;
}

// ❌ DON'T EXPORT: Internal API response wrappers
interface WidgetUpsertSuccessResponse {
	success: true;
	data: { id: string }[];
}

interface WidgetUpsertErrorResponse {
	success: false;
	message: string;
}

type WidgetUpsertResponse = WidgetUpsertSuccessResponse | WidgetUpsertErrorResponse;

// These internal types are only used within your service implementation
// Users don't need to see the API's internal response format
```

### Step 2: Define the Service Interface

Create a public interface defining all methods your service exposes.

```typescript
import { FetchAdapter } from './adapter';

/**
 * Widget service for managing widgets
 */
export interface WidgetAPI {
	/**
	 * Create a new widget
	 *
	 * @param name - the widget name (1-254 characters)
	 * @param params - optional creation parameters
	 * @returns a Promise that resolves to the created Widget
	 */
	create(name: string, params?: CreateWidgetParams): Promise<Widget>;

	/**
	 * Get a widget by id
	 *
	 * @param id - the widget id
	 * @returns a Promise that resolves to WidgetResult
	 */
	get(id: string): Promise<WidgetResult>;

	/**
	 * List widgets with optional filtering
	 *
	 * @param params - optional filter and pagination parameters
	 * @returns a Promise that resolves to ListWidgetsResponse
	 */
	list(params?: ListWidgetsParams): Promise<ListWidgetsResponse>;

	/**
	 * Update a widget
	 *
	 * @param id - the widget id to update
	 * @param params - the update parameters
	 * @returns a Promise that resolves when update completes
	 */
	update(id: string, params: Partial<CreateWidgetParams>): Promise<void>;

	/**
	 * Delete a widget
	 *
	 * @param id - the widget id to delete
	 * @returns a Promise that resolves when deletion completes
	 */
	delete(id: string): Promise<void>;
}
```

**Advanced: Variadic Parameters for Batch Operations**

Use rest parameters for batch operations:

```typescript
export interface VectorStorage {
	/**
	 * Upsert one or more vectors into storage
	 *
	 * @param name - the storage name
	 * @param documents - one or more documents to upsert
	 * @returns array of generated IDs
	 */
	upsert(name: string, ...documents: VectorUpsertParams[]): Promise<string[]>;

	/**
	 * Delete one or more vectors from storage
	 *
	 * @param name - the storage name
	 * @param keys - one or more keys to delete
	 * @returns count of deleted items
	 */
	delete(name: string, ...keys: string[]): Promise<number>;
}

// Usage allows flexible batch sizes:
await vectorStorage.upsert('docs', doc1);
await vectorStorage.upsert('docs', doc1, doc2, doc3);
await vectorStorage.delete('docs', 'key1', 'key2', 'key3');
```

**Advanced: Generic Methods**

Use generic methods for type-safe operations:

```typescript
export interface SearchAPI {
	/**
	 * Search with type-safe metadata filtering
	 */
	search<T extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
		params: SearchParams<T>
	): Promise<SearchResult[]>;
}
```

### Step 3: Implement the Service Class

Implement the interface with proper error handling, validation, and telemetry.

```typescript
import { FetchAdapter } from './adapter';
import { buildUrl, toServiceException, toPayload, fromResponse } from './_util';

export class WidgetAPIService implements WidgetAPI {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async create(name: string, params?: CreateWidgetParams): Promise<Widget> {
		// 1. Validate inputs
		if (!name || name.length < 1 || name.length > 254) {
			throw new Error('Widget name must be between 1 and 254 characters');
		}

		if (params?.ttl && params.ttl < 60) {
			throw new Error('TTL must be at least 60 seconds');
		}

		// 2. Build the URL
		const url = buildUrl(this.#baseUrl, '/widget/v1');

		// 3. Prepare request body
		const body = JSON.stringify({
			name,
			...(params?.options && { options: params.options }),
			...(params?.ttl && { ttl: params.ttl }),
		});

		// 4. Set appropriate timeout
		const signal = AbortSignal.timeout(10_000);

		// 5. Prepare telemetry attributes
		const attributes: Record<string, string> = { name };
		if (params?.ttl) {
			attributes.ttl = String(params.ttl);
		}

		// 6. Make the API call
		const res = await this.#adapter.invoke<Widget>(url, {
			method: 'POST',
			body,
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.widget.create',
				attributes,
			},
		});

		// 7. Handle response
		if (res.ok) {
			return res.data;
		}

		// 8. Throw service exception on error
		throw await toServiceException('POST', url, res.response);
	}

	async get(id: string): Promise<WidgetResult> {
		// Validate
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new Error('Widget id is required and must be a non-empty string');
		}

		// Build URL with path parameter
		const url = buildUrl(this.#baseUrl, `/widget/v1/${encodeURIComponent(id)}`);
		const signal = AbortSignal.timeout(10_000);

		const res = await this.#adapter.invoke<Widget>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.widget.get',
				attributes: { id },
			},
		});

		if (res.ok) {
			return {
				data: res.data,
				exists: true,
			};
		}

		// Handle 404 specially for get operations
		if (res.response.status === 404) {
			return { exists: false } as WidgetResultNotFound;
		}

		throw await toServiceException('GET', url, res.response);
	}

	async list(params?: ListWidgetsParams): Promise<ListWidgetsResponse> {
		// Validate pagination parameters
		if (params?.limit !== undefined) {
			if (params.limit <= 0 || params.limit > 1000) {
				throw new Error('limit must be greater than 0 and less than or equal to 1000');
			}
		}

		if (params?.offset !== undefined && params.offset < 0) {
			throw new Error('offset must be non-negative');
		}

		// Build telemetry attributes
		const attributes: Record<string, string> = {};
		if (params?.limit !== undefined) {
			attributes.limit = String(params.limit);
		}
		if (params?.offset !== undefined) {
			attributes.offset = String(params.offset);
		}
		if (params?.filter) {
			attributes.filter = params.filter;
		}

		// Build request body
		const requestBody: Record<string, unknown> = {};
		if (params?.filter) {
			requestBody.filter = params.filter;
		}
		if (params?.limit) {
			requestBody.limit = params.limit;
		}
		if (params?.offset) {
			requestBody.offset = params.offset;
		}

		const url = buildUrl(this.#baseUrl, '/widget/v1/list');
		const signal = AbortSignal.timeout(30_000); // Longer timeout for list operations

		const res = await this.#adapter.invoke<ListWidgetsResponse>(url, {
			method: 'POST',
			body: JSON.stringify(requestBody),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.widget.list',
				attributes,
			},
		});

		if (res.ok) {
			return res.data;
		}

		throw await toServiceException('POST', url, res.response);
	}

	async update(id: string, params: Partial<CreateWidgetParams>): Promise<void> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new Error('Widget id is required and must be a non-empty string');
		}

		if (Object.keys(params).length === 0) {
			throw new Error('At least one parameter must be provided for update');
		}

		const url = buildUrl(this.#baseUrl, `/widget/v1/${encodeURIComponent(id)}`);
		const body = JSON.stringify(params);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<void>(url, {
			method: 'PUT',
			body,
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.widget.update',
				attributes: { id },
			},
		});

		if (res.ok) {
			return;
		}

		throw await toServiceException('PUT', url, res.response);
	}

	async delete(id: string): Promise<void> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new Error('Widget id is required and must be a non-empty string');
		}

		const url = buildUrl(this.#baseUrl, `/widget/v1/${encodeURIComponent(id)}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<void>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.widget.delete',
				attributes: { id },
			},
		});

		if (res.ok) {
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}
}
```

### Step 4: Export Your Service

Add your service to [src/services/index.ts](../src/services/index.ts):

```typescript
export * from './adapter';
export * from './exception';
export * from './keyvalue';
export * from './server';
export * from './stream';
export * from './widget'; // Add this line
```

## Utilities Reference

### buildUrl()

Constructs URLs with proper path joining and optional query parameters.

```typescript
buildUrl(
  base: string,
  path: string,
  subpath?: string,
  query?: URLSearchParams
): string
```

**Examples:**

```typescript
buildUrl('https://api.example.com', '/widget/v1');
// => 'https://api.example.com/widget/v1'

buildUrl('https://api.example.com/', 'widget/v1', 'abc123');
// => 'https://api.example.com/widget/v1/abc123'

buildUrl('https://api.example.com', '/widget', undefined, new URLSearchParams({ limit: '10' }));
// => 'https://api.example.com/widget?limit=10'
```

**Use for:** Constructing all API endpoint URLs

### toServiceException()

Converts a failed Response into a ServiceException with appropriate error message.

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

async toServiceException(method: HttpMethod, url: string, response: Response): Promise<ServiceException>
```

**Parameters:**

- `method` - HTTP method (type-safe enum of valid methods)
- `url` - Request URL
- `response` - Failed Response object

**Features:**

- Type-safe HTTP method parameter prevents incorrect method strings
- Extracts error messages from JSON responses (`message` or `error` fields)
- Handles text responses
- Falls back to `statusText`
- Includes HTTP status code

**Use for:** Converting all non-OK responses to exceptions

### toPayload()

Converts various data types into a body/content-type pair for HTTP requests.

```typescript
async toPayload(data: unknown): Promise<[Body, string]>
```

**Handling:**

- `string` → detects JSON, otherwise `text/plain`
- `number`/`boolean` → `text/plain`
- `ArrayBuffer`/`Buffer` → `application/octet-stream`
- `ReadableStream` → `application/octet-stream`
- `Promise` → awaits and converts result
- `Function` → executes and converts result
- `object` → JSON stringified to `application/json`

**Use for:** PUT/POST operations with non-JSON bodies

### fromResponse()

Parses Response body based on Content-Type header.

```typescript
async fromResponse<T>(response: Response): Promise<T>
```

**Handling:**

- `application/json` → `response.json()`
- `text/*` → `response.text()`
- `application/octet-stream` → `response.arrayBuffer()`
- Other types → throws ServiceException

**Use for:** Parsing successful response bodies (the adapter uses this internally)

### safeStringify()

Safe JSON stringification that handles circular references.

```typescript
import { safeStringify } from '@agentuity/core';
```

**Use for:** Converting objects to JSON when you're unsure about circular references

**When to use `safeStringify()` vs `JSON.stringify()`:**

```typescript
// Use JSON.stringify() for simple, controlled data you're constructing:
const body = JSON.stringify({
	name,
	limit: params.limit,
	metadata: params.metadata,
});

// Use safeStringify() for user-provided or complex data structures:
import { safeStringify } from '../json';

const res = await this.#adapter.invoke(url, {
	method: 'PUT',
	body: safeStringify(documents), // User-provided array, might have circular refs
	contentType: 'application/json',
});

// General rule:
// - JSON.stringify() → Data you create/control (request bodies you construct)
// - safeStringify() → User-provided data or complex structures (variadic params, nested objects)
```

## Best Practices

### Input Validation

**Always validate inputs before making API calls:**

```typescript
// String length validation
if (!name || name.length < 1 || name.length > 254) {
	throw new Error('Name must be between 1 and 254 characters');
}

// String presence validation
if (!id || typeof id !== 'string' || id.trim().length === 0) {
	throw new Error('ID is required and must be a non-empty string');
}

// Numeric range validation
if (params?.limit !== undefined) {
	if (params.limit <= 0 || params.limit > 1000) {
		throw new Error('limit must be greater than 0 and less than or equal to 1000');
	}
}

// TTL validation (common for cache/storage operations)
if (params?.ttl && params.ttl < 60) {
	throw new Error('TTL must be at least 60 seconds');
}
```

**Validating array elements:**

```typescript
// Validate each element in a variadic parameter
async upsert(name: string, ...documents: VectorUpsertParams[]): Promise<string[]> {
  if (!documents || documents.length === 0) {
    throw new Error('At least one document is required');
  }

  for (const doc of documents) {
    if (!doc.key || typeof doc.key !== 'string' || doc.key.trim().length === 0) {
      throw new Error('Each document must have a non-empty key');
    }

    // Validate discriminated union
    if (!('embeddings' in doc) && !('document' in doc)) {
      throw new Error('Each document must have either embeddings or document text');
    }

    if ('embeddings' in doc && doc.embeddings) {
      if (!Array.isArray(doc.embeddings) || doc.embeddings.length === 0) {
        throw new Error('Embeddings must be a non-empty array of numbers');
      }
    }
  }

  // ... proceed with API call
}
```

### Timeout Values

Choose appropriate timeout values based on operation type:

```typescript
// Fast operations (GET, simple POST): 10 seconds
const signal = AbortSignal.timeout(10_000);

// Longer operations (LIST, complex queries, DELETE, UPDATE): 30 seconds
const signal = AbortSignal.timeout(30_000);

// Streaming/upload operations: may need longer or no timeout
// (handle via request lifecycle rather than timeout)
```

### Telemetry

**Always include telemetry with every API call:**

```typescript
telemetry: {
  name: 'agentuity.{service}.{operation}',  // Use consistent naming
  attributes: {
    // Include relevant identifiers
    id: 'widget-123',

    // Include operation parameters (avoid sensitive data)
    limit: String(params.limit),
    offset: String(params.offset),

    // Convert all values to strings
    ttl: String(params.ttl),
  },
}
```

**Naming convention:**

- Pattern: `agentuity.{service}.{operation}`
- Examples: `agentuity.widget.create`, `agentuity.widget.list`
- Lowercase, dot-separated

### Error Handling Pattern

**Standard error handling for all operations:**

```typescript
const res = await this.#adapter.invoke<ReturnType>(url, options);

if (res.ok) {
	// Success case - return data
	return res.data;
}

// Special handling for expected 404s (get operations)
if (res.response.status === 404) {
	return { exists: false } as NotFoundType;
}

// All other errors - throw exception
throw await toServiceException('GET', url, res.response);
```

**Early returns for optimization:**

```typescript
async delete(name: string, ...keys: string[]): Promise<number> {
  // Validate name first
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Name is required');
  }

  // Early return - avoid API call if no work to do
  if (keys.length === 0) {
    return 0;
  }

  // ... proceed with API call
}
```

### URL Encoding

**Always encode user-provided path segments:**

```typescript
// DO: Encode path parameters
const url = buildUrl(this.#baseUrl, `/widget/${encodeURIComponent(id)}`);

// DON'T: Use raw user input in URLs
const url = buildUrl(this.#baseUrl, `/widget/${id}`); // ❌ Unsafe
```

### Content-Type Handling

**Specify Content-Type explicitly for JSON:**

```typescript
const res = await this.#adapter.invoke(url, {
	method: 'POST',
	body: JSON.stringify(data),
	contentType: 'application/json', // ✅ Always specify for JSON
	signal,
});
```

**Let adapter auto-detect for other types:**

```typescript
// Binary data - adapter will set application/octet-stream
const res = await this.#adapter.invoke(url, {
	method: 'PUT',
	body: arrayBuffer,
	signal,
});
```

### API Versioning

**Include version in URL paths for stability:**

```typescript
// DO: Version your API endpoints
buildUrl(this.#baseUrl, '/widget/v1');
buildUrl(this.#baseUrl, '/kv/2025-03-17');

// Allows backward compatibility and gradual migration
```

### Optional Parameters

**Use object spreading for optional parameters:**

```typescript
const body = JSON.stringify({
	requiredField: value,
	...(params?.optionalField && { optionalField: params.optionalField }),
	...(params?.metadata && { metadata: params.metadata }),
});
```

**Conditionally include request properties:**

```typescript
// Include body only when needed
const res = await this.#adapter.invoke(url, {
	method: 'DELETE',
	...(body && { body, contentType: 'application/json' }),
	signal,
});
```

### Return Type Patterns

**For operations that may not find data:**

```typescript
export type WidgetResult = WidgetResultFound | WidgetResultNotFound;

// Allows type-safe checking:
const result = await widgetAPI.get(id);
if (result.exists) {
	console.log(result.data.name); // TypeScript knows data exists
} else {
	console.log('Widget not found'); // TypeScript knows data is never
}
```

**For operations that return nothing:**

```typescript
async delete(id: string): Promise<void> {
  // ...
  if (res.ok) {
    return;  // Simply return on success
  }
  throw await toServiceException('DELETE', url, res.response);
}
```

### JSDoc Comments

**Document all public APIs:**

````typescript
/**
 * Create a new widget
 *
 * @param name - the widget name (1-254 characters)
 * @param params - optional creation parameters
 * @returns a Promise that resolves to the created Widget
 * @throws {Error} if name is invalid or API call fails
 *
 * @example
 * ```typescript
 * const widget = await widgetAPI.create('my-widget', {
 *   options: { color: 'blue' },
 *   ttl: 3600
 * });
 * ```
 */
async create(name: string, params?: CreateWidgetParams): Promise<Widget>
````

## Examples

### Simple CRUD Service

See [src/services/keyvalue.ts](../src/services/keyvalue.ts) for a complete example of a simple CRUD service with:

- GET operation with 404 handling
- PUT operation with TTL support
- DELETE operation
- Input validation
- Proper telemetry

### Complex Streaming Service

See [src/services/stream.ts](../src/services/stream.ts) for an advanced example featuring:

- Custom WritableStream implementation
- Streaming uploads with compression
- List operation with filtering
- Multiple response types
- Complex type definitions

### Batch Operations Service

See [src/services/vector.ts](../src/services/vector.ts) for an example with advanced patterns:

- Variadic parameters for batch operations
- Discriminated union types (embeddings OR document text)
- Generic type parameters for type-safe metadata
- Array element validation
- Early returns for optimization
- Different URL patterns for single vs batch operations

### Minimal Example

```typescript
import { FetchAdapter } from './adapter';
import { buildUrl, toServiceException } from './_util';

export interface PingResponse {
	status: 'ok';
	timestamp: string;
}

export interface HealthAPI {
	ping(): Promise<PingResponse>;
}

export class HealthAPIService implements HealthAPI {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async ping(): Promise<PingResponse> {
		const url = buildUrl(this.#baseUrl, '/health/ping');
		const signal = AbortSignal.timeout(10_000);

		const res = await this.#adapter.invoke<PingResponse>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.health.ping',
				attributes: {},
			},
		});

		if (res.ok) {
			return res.data;
		}

		throw await toServiceException('POST', url, res.response);
	}
}
```

## Testing Your Service

### Test File Location

**Create test files in the `__test__` directory:**

```
src/services/__test__/yourservice.test.ts
```

This keeps test files organized and separate from production code.

### Using the Mock Adapter Helper

The codebase provides a `createMockAdapter` helper for cleaner, type-safe test mocks:

```typescript
import { describe, test, expect } from 'bun:test';
import { WidgetAPIService } from '../widget';
import { createMockAdapter } from './mock-adapter';

describe('WidgetAPIService', () => {
	const baseUrl = 'https://api.example.com';

	test('create validates input', async () => {
		const { adapter } = createMockAdapter([]);
		const service = new WidgetAPIService(baseUrl, adapter);

		await expect(service.create('')).rejects.toThrow(
			'Widget name must be between 1 and 254 characters'
		);
	});

	test('create calls adapter with correct parameters', async () => {
		const { adapter, calls } = createMockAdapter([
			{ ok: true, data: { id: 'widget-1', name: 'Test Widget' } },
		]);

		const service = new WidgetAPIService(baseUrl, adapter);
		await service.create('test-widget', { ttl: 300 });

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(`${baseUrl}/widget/v1`);
		expect(calls[0].options).toMatchObject({
			method: 'POST',
			contentType: 'application/json',
		});
	});
});
```

### Mock Adapter Benefits

**createMockAdapter** provides:

1. **Type Safety** - No `as any` needed
2. **Call Tracking** - Access `calls` array to inspect requests
3. **Multi-Response** - Pass array of responses for sequential calls
4. **Hooks** - `onBefore` and `onAfter` callbacks for advanced scenarios

**Basic usage:**

```typescript
// Single response
const { adapter } = createMockAdapter([
  { ok: true, data: { id: '123' } },
]);

// Multiple sequential responses
const { adapter } = createMockAdapter([
  { ok: true, data: { result: 'first' } },
  { ok: true, data: { result: 'second' } },
  { ok: false, status: 404 },
]);

// Track calls
const { adapter, calls } = createMockAdapter([...]);
await service.someMethod();
expect(calls[0].url).toBe('https://...');
expect(calls[0].options.method).toBe('POST');
```

**Error responses:**

```typescript
const { adapter } = createMockAdapter([
	{ ok: false, status: 404 },
	{ ok: false, status: 500, body: { message: 'Server error' } },
]);
```

**Advanced: Using hooks:**

```typescript
const { adapter } = createMockAdapter([], {
	onBefore: async () => {
		throw new Error('Not Found 404'); // Simulate error before request
	},
});
```

## Troubleshooting

### Common Issues

**TypeError: Cannot read property 'ok' of undefined**

- Ensure your adapter is returning a `FetchResponse<T>` object
- Check that both `ok` and `response` fields are present

**ServiceException: Unauthorized (401)**

- Verify that the adapter is including authentication headers
- Check the `ServerFetchAdapter` configuration

**Timeout errors**

- Adjust timeout values based on operation complexity
- Consider network latency for API calls

**Type errors with response data**

- Ensure your response types match the actual API response structure
- Use `fromResponse<T>()` with correct generic type

**URL building issues**

- Remember to use `encodeURIComponent()` for path parameters
- Use `buildUrl()` for consistent URL construction

## Integration into Server Package

After implementing and testing your service, you need to integrate it into the `@agentuity/runtime` package so it's available in agent contexts.

### Step 1: Update `_services.ts`

In `packages/runtime/src/_services.ts`:

#### 1. Import your service

```typescript
import {
	createServerFetchAdapter,
	KeyValueStorageService,
	StreamAPIService,
	VectorStorageService, // Add your service
} from '@agentuity/core';
```

#### 2. Configure the base URL

```typescript
const vectorBaseUrl =
	process.env.AGENTUITY_VECTOR_URL ||
	process.env.AGENTUITY_TRANSPORT_URL ||
	'https://agentuity.ai';
```

#### 3. Add telemetry handling (optional but recommended)

In the `onAfter` callback, add custom span attributes for your service:

```typescript
onAfter: async (url, options, result, err) => {
  // ... existing code ...
  const span = trace.getSpan(context.active());
  switch (options.telemetry?.name) {
    // ... existing cases ...
    case 'agentuity.vector.upsert': {
      if (result.response.ok) {
        const data = result.data as { data: Array<{ id: string }> };
        span?.setAttributes({
          'vector.count': data.data.length,
        });
      }
      break;
    }
    case 'agentuity.vector.search': {
      if (result.response.ok) {
        const data = result.data as { data: Array<unknown> };
        span?.setAttributes({
          'vector.results': data.data.length,
        });
      }
      break;
    }
  }
},
```

#### 4. Instantiate the service

```typescript
const kv = new KeyValueStorageService(kvBaseUrl, adapter);
const stream = new StreamAPIService(streamBaseUrl, adapter);
const vector = new VectorStorageService(vectorBaseUrl, adapter); // Add this
```

#### 5. Register the service

```typescript
export function registerServices(o: any) {
	Object.defineProperty(o, 'kv', {
		get: () => kv,
		enumerable: false,
		configurable: false,
	});
	Object.defineProperty(o, 'stream', {
		get: () => stream,
		enumerable: false,
		configurable: false,
	});
	Object.defineProperty(o, 'vector', {
		// Add this
		get: () => vector,
		enumerable: false,
		configurable: false,
	});
}
```

### Step 2: Update AgentContext Interface

In `packages/runtime/src/agent.ts`, add your service type to the AgentContext interface:

#### 1. Import the type

```typescript
import type {
	StandardSchemaV1,
	KeyValueStorage,
	StreamStorage,
	VectorStorage, // Add your service type
} from '@agentuity/core';
```

#### 2. Add to AgentContext interface

Around line 9, add your service property:

```typescript
export interface AgentContext {
	waitUntil: (promise: Promise<void> | (() => void | Promise<void>)) => void;
	agent?: any;
	current?: any;
	agentName?: AgentName;
	logger: Logger;
	sessionId: string;
	tracer: Tracer;
	kv: KeyValueStorage;
	stream: StreamStorage;
	vector: VectorStorage; // Add your service
}
```

#### 3. Update RequestAgentContext class

In `packages/runtime/src/_context.ts`, declare the service properties:

**Import types:**

```typescript
import type { KeyValueStorage, StreamStorage, VectorStorage } from '@agentuity/core';
```

**Add to class (around line 25):**

```typescript
export class RequestAgentContext<TAgentMap, TAgent> implements AgentContext {
	agent: TAgentMap;
	current: TAgent;
	agentName: AgentName;
	logger: Logger;
	sessionId: string;
	tracer: Tracer;
	kv!: KeyValueStorage;
	stream!: StreamStorage;
	vector!: VectorStorage; // Add your service with ! (definite assignment)

	// ... constructor calls registerServices(this) which sets these via Object.defineProperty
}
```

**Why use `!` (definite assignment assertion):**

- Services are set via `registerServices(this)` in constructor using `Object.defineProperty`
- TypeScript can't detect this, so we use `!` to indicate they will be assigned
- This is safe because `registerServices` is always called in constructor

### Step 4: Update CLI Bundle Plugin

In `packages/cli/src/cmd/bundle/plugin.ts`, update the `declare module "hono"` section:

#### 1. Import the type

```typescript
import type { KeyValueStorage, StreamStorage, VectorStorage } from '@agentuity/core';
```

#### 2. Add to Context interface

```typescript
declare module "hono" {
  interface Context {
    agentName: AgentName;
    agent: {
      [K in AgentName]: AgentRunner<...>;
    };
    waitUntil: (promise: Promise<void> | (() => void | Promise<void>)) => void;
    logger: Logger;
    kv: KeyValueStorage;
    stream: StreamStorage;
    vector: VectorStorage;  // Add your service
  }
}
```

Find line 45 where types are imported and add your service:

```typescript
import type { KeyValueStorage, StreamStorage, VectorStorage } from '@agentuity/core';
```

Find line 66-67 where services are declared in the Context and add your service:

```typescript
kv: KeyValueStorage;
stream: StreamStorage;
vector: VectorStorage; // Add this line
```

### Step 3: Test the Integration

Create a test agent to verify the service is available:

```typescript
// In your agent file
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent({
	metadata: {
		id: 'test-vector',
		name: 'Test Vector',
		description: 'Test vector search',
	},
	schema: {
		input: s.object({
			query: s.string(),
		}),
		output: s.object({
			results: s.array(s.any()),
		}),
	},
	async handler(c, input) {
		// Service is now available on context
		const results = await c.vector.search('my-docs', {
			query: input.query,
			limit: 10,
		});

		return {
			results,
		};
	},
});
```

### Step 5: Type Safety Verification

After making these changes:

1. **Rebuild the runtime**: `cd packages/runtime && bun run build`
2. **Rebuild the CLI**: `cd packages/cli && bun run build`
3. **Bundle your app**: The generated `registry.generated.ts` should include the new service
4. **Check TypeScript**: `c.vector` should have full type completion
5. **Test in development**: Run your agent and verify the service works

### Step 6: Create Integration Test Agent

Create a test agent in the `test-app` to manually verify your service works end-to-end.

#### 1. Create agent directory

```bash
mkdir -p test-app/src/agent/yourservice
```

#### 2. Create agent.ts

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent({
	schema: {
		input: s.object({
			operation: s.union([s.literal('testOp1'), s.literal('testOp2')]),
			param: s.string(),
		}),
		output: s.object({
			operation: s.string(),
			success: s.boolean(),
			result: s.optional(s.any()),
		}),
	},
	handler: async ({ operation, param }) => {
		switch (operation) {
			case 'testOp1': {
				// Test your service operation
				const result = await c.yourservice.someMethod(param);
				return {
					operation,
					success: true,
					result,
				};
			}

			case 'testOp2': {
				// Test another operation
				const result = await c.yourservice.anotherMethod(param);
				return {
					operation,
					success: true,
					result,
				};
			}
		}
	},
});

export default agent;
```

#### 3. Create route.ts

```typescript
import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const result = await c.agent.yourservice.run({
		operation: 'testOp1',
		param: 'test-value',
	});
	return c.json(result);
});

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.yourservice.run(data);
	return c.json(result);
});

export default router;
```

#### 4. Build and test

```bash
cd test-app
bun run build
bun run .agentuity/app.js &

# Test GET endpoint
curl http://localhost:3500/agent/yourservice

# Test POST endpoint
curl http://localhost:3500/agent/yourservice \
  --json '{"operation":"testOp2","param":"value"}'

# Stop server
lsof -ti:3500 | xargs kill -9
```

**Example: Vector Service Test Agent**

See [test-app/src/agent/vector/agent.ts](../../../test-app/src/agent/vector/agent.ts) for a complete example that exercises:

- ✅ `upsert()` with documents and metadata
- ✅ `get()` with discriminated union result
- ✅ `getMany()` batch operation
- ✅ `search()` with type-safe metadata
- ✅ `delete()` variadic parameters
- ✅ `exists()` check

### Complete Integration Checklist

**Server Package:**

- [ ] Service imported in `packages/runtime/src/_services.ts`
- [ ] Base URL configured with environment variable fallback
- [ ] Telemetry handling added to `onAfter` callback (optional)
- [ ] Service instantiated with adapter
- [ ] Service registered in `registerServices()`
- [ ] Type imported in `packages/runtime/src/agent.ts`
- [ ] Service added to AgentContext interface
- [ ] Type imported in `packages/runtime/src/_context.ts`
- [ ] Service declared in RequestAgentContext class with `!`

**CLI Package:**

- [ ] Type imported in `packages/cli/src/cmd/bundle/plugin.ts` (line ~45)
- [ ] Type added to Hono Context interface (line ~67)

**Verification:**

- [ ] Server package rebuilt
- [ ] CLI package rebuilt
- [ ] Test-app built successfully
- [ ] Type safety verified in agent code
- [ ] Test agent created in `test-app/src/agent/yourservice/`
- [ ] Integration tested via HTTP requests

## Quality Assurance

After implementing your service, run these validation checks **in order**:

### 1. Format Code

**Format your service files first:**

```bash
bunx prettier packages/core/src/services/yourservice.ts --write
bunx prettier packages/core/src/services/__test__/yourservice.test.ts --write
```

**Or format all files:**

```bash
bunx prettier */** --write --fix
```

**Why format first:**

- Ensures consistent code style before linting
- Prettier auto-fixes many formatting issues
- Required step before committing code

**Prettier Configuration:**

- Tabs (width 3)
- Single quotes
- Semicolons
- 100 character line width
- See `.prettierrc` for full configuration

### 2. TypeScript Compilation

**Core package:**

```bash
cd packages/core && bunx tsc --noEmit
```

**All packages:**

```bash
bun run typecheck  # From monorepo root
```

**Must pass with zero errors before proceeding.**

### 3. Linting

**Lint your service files:**

```bash
bunx eslint packages/core/src/services/yourservice.ts
bunx eslint packages/core/src/services/__test__/yourservice.test.ts
```

**Lint all packages:**

```bash
bun lint  # From monorepo root
```

**Common Lint Issues:**

- **Unused imports** - Remove any imports you're not using
- **Unused variables** - Remove or prefix with `_` if intentionally unused
- **`any` types in tests** - Disable with `/* eslint-disable @typescript-eslint/no-explicit-any */`
- **`any` types in production code** - Replace with proper types (never suppress in production code)

**Run after formatting** to catch any remaining style issues.

### 4. Tests

**Run your service tests:**

```bash
bun test src/services/__test__/yourservice.test.ts
```

**Run all tests:**

```bash
bun test  # From package or monorepo root
```

**Must achieve:**

- 100% tests passing
- All validation scenarios covered
- All happy paths tested
- Error cases handled

### 5. Build

**Build the core package:**

```bash
cd packages/core && bun run build
```

**Build all packages:**

```bash
bun run build  # From monorepo root
```

**Must build without errors.**

### Quality Checklist

Before considering your service complete, validate in this order:

1. ✅ **Format** - Run Prettier on all files
2. ✅ **TypeScript** - No compilation errors
3. ✅ **Linting** - No ESLint errors or warnings (run after format)
4. ✅ **Tests** - All tests passing (aim for 100% coverage)
5. ✅ **Build** - All packages build successfully
6. ✅ **Documentation** - All public APIs have JSDoc comments
7. ✅ **Integration** - Service available in agent context
8. ✅ **Type Safety** - Full autocomplete and type checking works

**Recommended workflow:**

```bash
# 1. Format
bunx prettier packages/core/src/services/yourservice.ts --write
bunx prettier packages/core/src/services/__test__/yourservice.test.ts --write

# 2. Typecheck
cd packages/core && bunx tsc --noEmit

# 3. Lint
bunx eslint packages/core/src/services/yourservice.ts
bunx eslint packages/core/src/services/__test__/yourservice.test.ts

# 4. Test
bun test src/services/__test__/yourservice.test.ts

# 5. Build
cd packages/core && bun run build
```

## Summary

When implementing a new service integration:

### Core Package

1. **Define types first** - Request params, response types, result types
2. **Create the interface** - Public API contract with JSDoc
3. **Implement the service** - Following the established patterns
4. **Validate inputs** - Before making API calls
5. **Use utilities** - `buildUrl`, `toServiceException`, etc.
6. **Add telemetry** - Every API call needs telemetry
7. **Handle errors** - Consistent error handling
8. **Export the service** - Add to `index.ts`
9. **Write tests** - In `__test__/` directory using `createMockAdapter`

### Server Package Integration

10. **Update `_services.ts`** - Import, instantiate, register service
11. **Update `agent.ts`** - Add service to AgentContext interface
12. **Update `_context.ts`** - Declare service in RequestAgentContext class

### CLI Package Integration

13. **Update `cmd/bundle/plugin.ts`** - Import type and add to Hono Context

### Quality & Verification

14. **Run quality checks** - Format, typecheck, lint, test, build (in that order)
15. **Create test agent** - In `test-app/src/agent/yourservice/`
16. **Integration test** - Verify via HTTP requests

The existing services ([keyvalue.ts](../src/services/keyvalue.ts), [stream.ts](../src/services/stream.ts), and [vector.ts](../src/services/vector.ts)) serve as reference implementations - use them as templates when building new integrations.

**Choose your reference based on complexity:**

- **Simple CRUD** → [keyvalue.ts](../src/services/keyvalue.ts)
- **Streaming/Complex** → [stream.ts](../src/services/stream.ts)
- **Batch/Advanced Types** → [vector.ts](../src/services/vector.ts)
