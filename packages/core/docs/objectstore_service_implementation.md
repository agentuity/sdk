# ObjectStorage Service Implementation Summary

## Overview

Successfully ported the ObjectStorage service from the old SDK (`sdk-js`) to the new SDK architecture (`sdk-mono`) following the how-to guide at [howto_new_service.md](./howto_new_service.md).

## What Was Implemented

### 1. Type Definitions ([src/services/objectstore.ts](../src/services/objectstore.ts))

**Public Types:**

- `ObjectStorePutParams` - Parameters for putting objects
   - `contentType` - MIME type of the object
   - `contentEncoding` - Content encoding (e.g., gzip)
   - `cacheControl` - Cache control header
   - `contentDisposition` - Content disposition header
   - `contentLanguage` - Content language header
   - `metadata` - Arbitrary key-value metadata (prefixed with `x-metadata-`)
- `ObjectResult` - Union type for get operation results
   - `ObjectResultFound` - Object exists with data and contentType
   - `ObjectResultNotFound` - Object does not exist
- `CreatePublicURLParams` - Parameters for creating signed URLs
   - `expiresDuration` - URL expiration in milliseconds (default: 1 hour)

**Internal Types:**

- `ObjectStoreCreatePublicURLSuccessResponse` - API success response
- `ObjectStoreCreatePublicURLErrorResponse` - API error response
- `ObjectStoreCreatePublicURLResponse` - Union of success/error responses

### 2. Service Interface

```typescript
export interface ObjectStorage {
	get(bucket: string, key: string): Promise<ObjectResult>;
	put(
		bucket: string,
		key: string,
		data: Uint8Array | ArrayBuffer | ReadableStream,
		params?: ObjectStorePutParams
	): Promise<void>;
	delete(bucket: string, key: string): Promise<boolean>;
	createPublicURL(bucket: string, key: string, params?: CreatePublicURLParams): Promise<string>;
}
```

### 3. Service Implementation

`ObjectStorageService` class implementing the `ObjectStorage` interface with:

**Constructor:**

- Accepts `baseUrl` and `FetchAdapter`
- Stores as private fields `#baseUrl` and `#adapter`

**Methods:**

#### `get(bucket: string, key: string): Promise<ObjectResult>`

- Validates bucket and key parameters
- Uses GET to `/object/2025-03-17/{bucket}/{key}`
- Returns discriminated union: `{ exists: true, data: Uint8Array, contentType: string }` or `{ exists: false }`
- Handles binary data without transformation
- 10s timeout (fast operation)
- Telemetry: `agentuity.objectstore.get` with bucket and key
- Special handling: 404 returns `{ exists: false }`

#### `put(bucket: string, key: string, data: Uint8Array | ArrayBuffer | ReadableStream, params?: ObjectStorePutParams): Promise<void>`

- Validates bucket, key, and data parameters
- Converts Uint8Array to ArrayBuffer for FetchAdapter
- Uses PUT to `/object/2025-03-17/{bucket}/{key}`
- Sends binary data directly (no JSON encoding)
- Supports all optional headers (Content-Type, Cache-Control, etc.)
- Metadata sent as `x-metadata-{key}` headers
- 30s timeout (for large uploads)
- Telemetry: `agentuity.objectstore.put` with bucket, key, and contentType
- Default content type: `application/octet-stream`

#### `delete(bucket: string, key: string): Promise<boolean>`

- Validates bucket and key parameters
- Uses DELETE to `/object/2025-03-17/{bucket}/{key}`
- Returns true if deleted, false if not found
- 10s timeout (fast operation)
- Telemetry: `agentuity.objectstore.delete` with bucket and key
- Special handling: 404 returns false, 200 returns true

#### `createPublicURL(bucket: string, key: string, params?: CreatePublicURLParams): Promise<string>`

- Validates bucket and key parameters
- Uses POST to `/object/2025-03-17/presigned/{bucket}/{key}`
- Request body: `{ expires?: number }` (JSON)
- Returns signed URL string
- 10s timeout (fast operation)
- Telemetry: `agentuity.objectstore.createPublicURL` with bucket, key, and expiresDuration
- Default expiration: Not set (API default is 1 hour)

## Key Design Decisions

### 1. Following the How-To Guide

The implementation strictly follows the patterns established in [howto_new_service.md](./howto_new_service.md):

✅ **Naming Convention**

- Interface: `ObjectStorage`
- Implementation: `ObjectStorageService`
- File: `objectstore.ts`
- Telemetry: `agentuity.objectstore.*`
- Context key: `c.objectstore` (lowercase)

✅ **Input Validation**

- All string parameters validated for non-empty content
- Data parameter validated for presence
- Bucket/key parameters trimmed and checked

✅ **Timeout Values**

- Fast operations (GET, DELETE): 10 seconds
- Longer operations (PUT): 30 seconds
- Public URL generation: 10 seconds

✅ **Error Handling**

- 404 handled specially (returns false/exists:false)
- API errors converted using `toServiceException()`
- Success:false responses throw descriptive errors

✅ **Telemetry**

- Every API call includes telemetry
- Attributes include operation-specific parameters
- All values converted to strings for attributes

✅ **URL Encoding**

- All path parameters use `encodeURIComponent()`
- URLs built with `buildUrl()` utility

### 2. Binary Data Handling

**Critical Design Choice:**

The implementation preserves binary data integrity by:

1. **No Text Encoding/Decoding**
   - Data flows as `ArrayBuffer` → `Uint8Array` → `ArrayBuffer`
   - No UTF-8 conversion that would corrupt binary data

2. **Type Safety**
   - Accepts `Uint8Array | ArrayBuffer | ReadableStream`
   - Returns `Uint8Array` in results
   - Converts types only when necessary for FetchAdapter

3. **Validation**
   - Tested with challenging binary data: null bytes (0x00), high bytes (0xFF, 0xFE, 0xFD, 0x80, 0x7F)
   - Verifies byte-for-byte accuracy in tests

### 3. Differences from Old Implementation

**Removed DataType/DataHandler Abstraction:**

- Old SDK: Used `DataType` and `DataHandler` abstractions
- New SDK: Direct binary types (`Uint8Array`, `ArrayBuffer`, `ReadableStream`)
- Benefit: Simpler API, no wrapping/unwrapping required

**Removed OpenTelemetry Direct Integration:**

- Old SDK: Direct OpenTelemetry span creation and context management
- New SDK: Telemetry handled by FetchAdapter via telemetry parameter
- Benefit: Cleaner separation of concerns

**Simplified Error Handling:**

- Old SDK: Complex response parsing with multiple conditional checks
- New SDK: Consistent `toServiceException()` for all errors
- Benefit: More consistent error messages and handling

**No API Key Handling:**

- Old SDK: Checked for API key in environment variables
- New SDK: Adapter handles authentication configuration
- Benefit: Environment-agnostic, works in any runtime

**Response Type Safety:**

- Old SDK: Used `DataResult` with `Data` type
- New SDK: Uses discriminated union types (`ObjectResult`)
- Benefit: Better TypeScript type narrowing

### 4. API Versioning

Uses versioned API path: `/object/2025-03-17/`

- Matches the old SDK version
- Allows future backward-compatible changes
- Consistent with other services (`/kv/2025-03-17/`, `/vector/2025-03-17/`)

### 5. Metadata Handling

**Custom Headers Pattern:**

- Metadata keys are prefixed with `x-metadata-`
- Example: `{ author: 'user123' }` → `x-metadata-author: user123`
- Not returned when fetching objects via HTTP
- Internal storage metadata only

## Files Modified/Created

### Created:

1. [src/services/objectstore.ts](../src/services/objectstore.ts) - Main implementation (456 lines)
2. [src/services/**test**/objectstore.test.ts](../src/services/__test__/objectstore.test.ts) - Comprehensive tests (29 tests)
3. [docs/objectstore_service_implementation.md](./objectstore_service_implementation.md) - This document
4. [test-app/src/agents/objectstore/agent.ts](../../../test-app/src/agents/objectstore/agent.ts) - Test agent
5. [test-app/src/agents/objectstore/route.ts](../../../test-app/src/agents/objectstore/route.ts) - Test routes

### Modified:

1. [src/services/index.ts](../src/services/index.ts) - Added `export * from './objectstore'`
2. [packages/runtime/src/\_services.ts](../../../packages/runtime/src/_services.ts) - Service registration
3. [packages/runtime/src/agent.ts](../../../packages/runtime/src/agent.ts) - AgentContext interface
4. [packages/runtime/src/\_context.ts](../../../packages/runtime/src/_context.ts) - RequestAgentContext class
5. [packages/bundler/src/plugin.ts](../../../packages/bundler/src/plugin.ts) - Hono context augmentation

## Validation

### TypeScript Compilation

```bash
bun run build
```

✅ Passes with no errors

### Test Suite

```bash
bun test src/services/__test__/objectstore.test.ts
```

✅ **29 tests**, all passing
✅ **67 assertions**, all passing

### Code Review Checklist

- ✅ Follows naming conventions
- ✅ All public APIs have JSDoc comments
- ✅ Input validation on all methods
- ✅ Proper error handling with ServiceException
- ✅ Telemetry on all API calls
- ✅ URL encoding for path parameters
- ✅ Appropriate timeout values
- ✅ Consistent with existing services (KeyValue, Stream, Vector)
- ✅ TypeScript strict mode compatible
- ✅ No external dependencies beyond core utilities
- ✅ Exported from index.ts
- ✅ Binary data integrity verified

## Testing

### Test Coverage (29 tests, 67 assertions)

#### 1. Get Operation Tests (8 tests)

- ✅ Get object successfully with text data
- ✅ Return not found for non-existent object
- ✅ Use default content type when not provided
- ✅ Validate bucket parameter (empty check)
- ✅ Validate key parameter (empty check)
- ✅ Handle URL encoding for bucket and key
- ✅ Handle binary data without transformation
- ✅ Throw error for server errors (5xx status codes)

#### 2. Put Operation Tests (10 tests)

- ✅ Put object with Uint8Array data
- ✅ Put object with ArrayBuffer data
- ✅ Use default content type when not provided
- ✅ Include optional headers (encoding, cache, disposition, language)
- ✅ Include metadata headers (x-metadata-\* pattern)
- ✅ Validate bucket parameter (empty check)
- ✅ Validate key parameter (empty check)
- ✅ Validate data parameter (null check)
- ✅ Handle binary data in put operations
- ✅ Throw error for client errors (4xx status codes)

#### 3. Delete Operation Tests (5 tests)

- ✅ Delete object successfully (returns true)
- ✅ Return false for non-existent object
- ✅ Validate bucket parameter (empty check)
- ✅ Validate key parameter (empty check)
- ✅ Throw error for access denied (403 status code)

#### 4. Create Public URL Tests (6 tests)

- ✅ Create public URL successfully
- ✅ Create public URL with custom expiration
- ✅ Handle error response with message
- ✅ Validate bucket parameter (empty check)
- ✅ Validate key parameter (empty check)
- ✅ Send empty JSON body when no expires provided

### Binary Data Validation

**Test Data Pattern:**

```typescript
const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x7f]);
```

This tests:

- Null bytes (0x00) - Would fail if treated as C-string
- Low bytes (0x01, 0x02) - Normal data
- High bytes (0xFF, 0xFE, 0xFD) - Would corrupt in UTF-8
- Sign-sensitive bytes (0x80, 0x7F) - Boundary of signed/unsigned

## Integration

### Server Package Integration

**Service Registration** (`packages/runtime/src/_services.ts`):

```typescript
const objectBaseUrl =
	process.env.AGENTUITY_OBJECTSTORE_URL ||
	process.env.AGENTUITY_TRANSPORT_URL ||
	'https://agentuity.ai';

const objectStore = new ObjectStorageService(objectBaseUrl, adapter);

Object.defineProperty(o, 'objectstore', {
	get: () => objectStore,
	enumerable: false,
	configurable: false,
});
```

**Telemetry Handling**:

```typescript
case 'agentuity.objectstore.get': {
  if (result.response.status === 404) {
    span?.addEvent('miss');
  } else if (result.response.ok) {
    span?.addEvent('hit');
  }
  break;
}
case 'agentuity.objectstore.delete': {
  if (result.response.status === 404) {
    span?.addEvent('not_found', { deleted: false });
  } else if (result.response.ok) {
    span?.addEvent('deleted', { deleted: true });
  }
  break;
}
```

### Agent Context

Available in agent handlers as `c.objectstore`:

```typescript
export interface AgentContext {
	kv: KeyValueStorage;
	objectstore: ObjectStorage; // ← Added
	stream: StreamStorage;
	vector: VectorStorage;
	// ... other properties
}
```

## Usage Examples

### Basic Text Storage

```typescript
import { ObjectStorageService, createServerFetchAdapter } from '@agentuity/core';

const adapter = createServerFetchAdapter({
	headers: { Authorization: `Bearer ${process.env.AGENTUITY_API_KEY}` },
});

const objectStore = new ObjectStorageService('https://agentuity.ai', adapter);

// Store text
const text = new TextEncoder().encode('Hello, world!');
await objectStore.put('my-bucket', 'greeting.txt', text, {
	contentType: 'text/plain',
});

// Retrieve text
const result = await objectStore.get('my-bucket', 'greeting.txt');
if (result.exists) {
	const text = new TextDecoder().decode(result.data);
	console.log(text); // "Hello, world!"
	console.log(result.contentType); // "text/plain"
}

// Delete
const deleted = await objectStore.delete('my-bucket', 'greeting.txt');
console.log(deleted); // true
```

### Binary Data Storage

```typescript
// Store binary data (e.g., image)
const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0 /* ... JPEG data */]);
await objectStore.put('images', 'photo.jpg', imageData, {
	contentType: 'image/jpeg',
	cacheControl: 'max-age=3600',
	metadata: {
		author: 'user123',
		uploadDate: new Date().toISOString(),
	},
});

// Retrieve binary data
const result = await objectStore.get('images', 'photo.jpg');
if (result.exists) {
	// result.data is Uint8Array - no transformation
	console.log('Image size:', result.data.length, 'bytes');
	console.log('Content type:', result.contentType); // "image/jpeg"
}
```

### Public URL Generation

```typescript
// Create a temporary public URL
const url = await objectStore.createPublicURL('images', 'photo.jpg', {
	expiresDuration: 3600000, // 1 hour in milliseconds
});

console.log('Public URL:', url);
// URL is valid for 1 hour, no authentication required
```

### Agent Usage (In test-app)

```typescript
handler: async (c: AgentContext, { operation, bucket, key, data }) => {
	switch (operation) {
		case 'put': {
			const bytes = new TextEncoder().encode(data);
			await c.objectstore.put(bucket, key, bytes, {
				contentType: 'text/plain',
			});
			return { operation, success: true };
		}

		case 'get': {
			const result = await c.objectstore.get(bucket, key);
			if (result.exists) {
				const text = new TextDecoder().decode(result.data);
				return { operation, success: true, result: { data: text } };
			}
			return { operation, success: false };
		}
	}
};
```

## Comparison with Old SDK

| Aspect             | Old SDK                             | New SDK                                       | Benefit                |
| ------------------ | ----------------------------------- | --------------------------------------------- | ---------------------- |
| **Data Types**     | `DataType` (string, Buffer, stream) | `Uint8Array`, `ArrayBuffer`, `ReadableStream` | Simpler, more standard |
| **Response**       | `DataResult` with `Data` wrapper    | `ObjectResult` discriminated union            | Better type narrowing  |
| **Error Handling** | Manual response parsing             | `toServiceException()` utility                | Consistent errors      |
| **Telemetry**      | Direct OpenTelemetry spans          | FetchAdapter telemetry parameter              | Cleaner separation     |
| **Auth**           | Environment variable checks         | Adapter-based configuration                   | Environment-agnostic   |
| **Timeout**        | Hardcoded in fetch calls            | AbortSignal.timeout() pattern                 | More flexible          |
| **Binary Safety**  | Buffer-based (Node.js)              | Uint8Array-based (universal)                  | Cross-platform         |

## Test Agent Operations

The test agent supports 6 operations:

1. **put** - Store text data
2. **get** - Retrieve text data
3. **delete** - Delete object
4. **createPublicURL** - Generate signed URL
5. **putBinary** - Store binary data (array of numbers)
6. **getBinary** - Retrieve binary data (returns array of numbers)

Binary operations verify no data transformation occurs during storage/retrieval.

## Conclusion

The ObjectStorage service has been successfully ported from the old SDK to the new architecture, following all patterns and best practices outlined in the how-to guide. The implementation is:

- ✅ Type-safe with discriminated unions
- ✅ Binary-safe with Uint8Array/ArrayBuffer
- ✅ Well-validated with 29 comprehensive tests
- ✅ Consistent with existing services (KeyValue, Stream, Vector)
- ✅ Fully integrated into server and bundler packages
- ✅ Documented with usage examples

The binary data handling was rigorously tested to ensure no corruption during storage and retrieval operations, making it suitable for images, videos, PDFs, and other binary file types.
