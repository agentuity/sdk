# Queue Service Test Plan — P2/P3 Remaining Cases

> This file documents planned test cases that extend coverage for the queue service
> beyond the P0/P1 tests implemented in `test/queue.test.ts`. See GitHub issue #1330
> for the original bug that motivated this test coverage analysis.

## Context

The root cause of #1330 was that the mock adapter (`createMockAdapter`) passes data
through in-memory without HTTP serialization, so tests couldn't catch mismatches between
the mock response shape and the real server's API envelope format. P0/P1 tests have been
implemented to cover envelope handling, field mapping, and schema validation. The tests
below cover remaining areas.

---

## P2: Sync vs Async Mode Tests

### 5a. Sync mode returns same response shape
**Description:** Publish with `{ sync: true }` and verify the response has the same
`QueuePublishResult` shape as async mode (id, offset, publishedAt all populated).

**Why:** The server has different code paths for sync vs async. Both should produce
the same envelope format.

### 5b. Async mode offset may be -1
**Description:** Publish without `sync` flag. Mock returns `offset: -1` (pending state).
Assert the offset is preserved as -1 and not coerced to 0 or undefined.

**Why:** Async publish returns immediately before the offset is assigned, so -1 is valid.

---

## P2: Error Response Format Tests

### 6a. 404 error with envelope body
**Description:** Mock returns HTTP 404 with body `{ success: false, message: "Queue not found" }`.
Assert `QueueNotFoundError` is thrown with the message from the response body.

**Why:** Error responses may also use the envelope format. The SDK should extract the
error message rather than returning a generic error.

### 6b. 402 Payment Required
**Description:** Mock returns HTTP 402. Assert an appropriate error is thrown.

**Why:** The server checks billing balance before allowing publish (see
`queue_2026_01_15.go:392`). The SDK should handle this gracefully.

### 6c. 201 with success: false in body
**Description:** Mock returns HTTP 201 (success status) but body has
`{ success: false, message: "something went wrong" }`. Assert the service doesn't
silently return bad data — it should either throw or handle gracefully.

**Why:** Guards against HTTP status / body disagreements.

### 6d. 200 with empty body
**Description:** Mock returns HTTP 200 with empty/null/undefined body.
Assert a clear error is thrown, not undefined fields.

**Why:** Network issues or proxy misconfiguration could produce empty successful responses.

### 6e. Network timeout
**Description:** Mock adapter that delays beyond the 30-second AbortSignal timeout.
Assert an abort/timeout error is thrown.

**Why:** The service sets `AbortSignal.timeout(30_000)` — verify it works.

---

## P3: Roundtrip / Data Integrity Tests

> These are integration-level tests that require either a real server or a more
> sophisticated mock. Consider implementing as part of an integration test suite.

### 7a. Publish ID matches receive ID
**Description:** Publish a message and capture the returned ID. Then receive from
the queue and verify the received message's ID matches the publish response.

**Why:** Catches cases where publish returns a stale or incorrect ID.

### 7b. Publish offset ordering
**Description:** Publish 3 messages in sequence with `sync: true`. Assert offsets
are monotonically increasing.

**Why:** Verifies the server's offset assignment is reflected correctly in responses.

### 7c. Payload roundtrip fidelity
**Description:** Publish with a complex payload (nested objects, arrays, special
characters, Unicode, empty strings, null values). Receive the message and verify
the payload is byte-identical after JSON deserialization.

**Why:** Catches encoding/serialization issues in the publish → receive pipeline.

---

## P3: Missing Coverage for Other Queue Operations

### 8a. QueueClient wrapper tests
**Description:** The `QueueClient` class (used in `apps/testing/queue/index.ts`)
wraps `QueueStorageService`. Add unit tests that verify `QueueClient.publish()`,
`createQueue()`, `deleteQueue()` all correctly delegate and return proper data.

**Why:** The wrapper might introduce its own response handling bugs.

### 8b. deleteQueue — cache invalidation under envelope response
**Description:** Test the create → cache hit → delete → cache miss → create cycle
using envelope-format mock data instead of flat mock data.

**Why:** Current cache tests use flat mock data. With envelope data, the `createQueue`
response parsing is different and could affect caching behavior.

### 8c. createQueue — 409 idempotent with envelope
**Description:** First `createQueue` call returns envelope response. Second call
returns 409. Assert both produce correct `QueueCreateResult`.

**Why:** Verify the cache + 409 path works correctly with the new envelope unwrapping.

---

## P3: Defensive Parsing Tests

### 9a. Response is a string instead of JSON object
**Description:** Mock `res.data` as a plain string (e.g., `"OK"` or `"Internal Server Error"`).
Assert the service throws a clear error, not a TypeError.

**Why:** Some proxies or error pages return plain text instead of JSON.

### 9b. Response is an array instead of object
**Description:** Mock `res.data` as `[]`. Assert the service throws a clear error.

**Why:** Guards against unexpected response shapes.

### 9c. Response is double-wrapped envelope
**Description:** Mock `res.data` as
`{ success: true, data: { data: { message: { ... } } } }` (double-wrapped).
Assert the service handles it correctly — either unwraps once (correct) or throws
a clear error (acceptable).

**Why:** Guards against accidental double-wrapping if the server or a middleware layer
applies the envelope twice.

### 9d. Response fields are null
**Description:** Mock with `{ id: null, offset: null, published_at: null }`.
Assert behavior is defined — either returns nulls or throws a validation error.

**Why:** Some databases return null for unset fields. The SDK should handle this explicitly.

---

## Structural Recommendations

### Create `createRealisticMockAdapter`
A variant of `createMockAdapter` that wraps mock data in a real `Response` object
with a JSON body and runs it through `fromResponse()`. This would exercise the actual
JSON parsing path, making it structurally impossible to miss envelope format mismatches.

**Implementation sketch:**
```typescript
function createRealisticMockAdapter(responses: MockResponse[]) {
    // Instead of passing data through directly, serialize to JSON Response
    // and let fromResponse() parse it — same as production code path
}
```

### Schema-Based Mock Validation
A test utility that validates every mock response against the corresponding Zod schema
(e.g., `MessageResponseSchema`) before the mock adapter returns it. This ensures mock
data always matches the documented API contract.

---

## Cross-Service Applicability

The same mock-vs-reality pattern affects other services using `FetchAdapter` directly:

| Service | Risk | Notes |
|---------|------|-------|
| `QueueStorageService` | **Fixed** | Envelope unwrapping added |
| `KeyValueStorageService` | Medium | Uses `res.data` directly — consistent but unvalidated |
| `StreamStorageService` | Low | Uses flat format, consistent with tests |
| `ScheduleService` | Unknown | **No tests exist** |
| `WebhookService` | Low | Already envelope-aware via `WebhookResponse<T>` |
| `TaskService` | Low | Already envelope-aware via `TaskResponse<T>` |
| `WorkflowService` | Low | Already envelope-aware via `WorkflowResponse<T>` |
| `EmailService` | Medium | Has defensive `unwrap()` but `getActivity()` uses unsafe cast |

Consider auditing all Medium/Unknown services with the same test approach.
