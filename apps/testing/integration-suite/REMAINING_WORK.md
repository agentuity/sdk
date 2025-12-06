# Integration Suite - Remaining Work

## Completed Phases ✅

- **Phase 1.1**: Project Setup
- **Phase 1.2**: Basic Agent Tests (8 tests)
- **Phase 1.3**: Router & HTTP Tests (12 tests)
- **Phase 2.1**: KeyValue Storage Tests (10 tests)
- **Phase 2.2**: Stream Storage Tests (12 tests)
- **Phase 2.3**: Vector Storage Tests (12 tests)
- **Phase 3.1**: Session Management Tests (11 tests)
- **Phase 5.2**: WaitUntil & Background Tasks (6 tests)

**Total: 71 tests across 7 suites**

---

## Skipped Phases (Require Different Testing Approach)

### Phase 3.2: Thread Management Tests

**Why Skipped**: Requires simulating multiple HTTP requests with cookies to test thread persistence across sessions. Our `agent.run()` approach shares the same session/thread context, making it impossible to test true thread persistence.

**Alternative**: Would need HTTP-based tests using `fetch()` or similar to make actual requests with cookie handling.

---

### Phase 4.1: WebSocket Tests

**Why Skipped**: Requires establishing WebSocket connections, which can't be done with `agent.run()`.

**Alternative**: Would need WebSocket client library to connect and test bidirectional communication.

---

### Phase 4.2: Server-Sent Events (SSE) Tests

**Why Skipped**: Requires SSE connection handling, similar to WebSocket.

**Alternative**: Would need EventSource or SSE client to test streaming.

---

### Phase 4.3: Email & SMS Tests

**Why Skipped**: Requires external service integration and mock handling.

**Alternative**: Unit tests for email/SMS service adapters, or integration tests with mock SMTP/SMS providers.

---

### Phase 4.4: Cron Tests

**Why Skipped**: Requires scheduled task execution over time.

**Alternative**: Unit tests for cron scheduling logic, mock time-based execution.

---

### Phase 5.1: App Lifecycle Tests

**Why Skipped**: Testing app setup/shutdown hooks requires starting and stopping the entire app.

**Alternative**: Unit tests in `packages/runtime/test/` for lifecycle hook logic.

---

### Phase 8: React Component Testing

**Why Skipped**: React components require browser environment and DOM.

**Alternative**: Separate test suite using Vitest + React Testing Library or Playwright for E2E.

---

### Phase 10.2: DevMode Tests

**Why Skipped**: Requires file watching, hot reload, environment variable loading.

**Alternative**: E2E tests that actually run `agentuity dev` and test reload behavior.

---

## Potentially Testable Phases with `agent.run()`

### Phase 5.3: Event System Tests

**Status**: Partially testable
**What Can Test**:

- Event listener registration
- Event dispatch within agent context
- Event payload validation

**Limitation**: Can't test cross-agent event propagation in shared context.

---

### Phase 6.1: Eval Framework Tests

**Status**: Testable
**What Can Test**:

- Creating evals
- Running evals on agents
- Eval result validation
- Scoring and metrics

**Approach**: Use `agent.run()` to test agents with eval wrappers.

---

### Phase 7.1: Error Handling Tests

**Status**: Highly testable
**What Can Test**:

- Schema validation errors
- StructuredError creation
- Error propagation through agents
- Error response formatting
- Try/catch in agent handlers

**Approach**: Agents that intentionally throw errors, validate error structure.

---

### Phase 7.2: Schema Validation Tests

**Status**: Highly testable
**What Can Test**:

- Input schema validation
- Output schema validation
- Type coercion
- Optional fields
- Default values
- Complex nested schemas

**Approach**: Agents with various schema patterns, test validation behavior.

---

### Phase 9.1: APIClient Tests

**Status**: Partially testable
**What Can Test**:

- APIClient initialization
- Request building
- Response parsing
- Error handling

**Limitation**: Requires mocking API responses or running against real API.

**Approach**: Could test in `packages/server/test/` as unit tests instead.

---

### Phase 10.1: Build & Metadata Tests

**Status**: Not suitable for integration suite
**What Can Test**: Better as unit tests in `packages/cli/test/`

- Metadata generation
- Route registry creation
- Bundle creation

---

### Phase 11.1: Concurrent Load Tests

**Status**: Partially implemented
**What We Have**: Most tests already run with concurrency 10
**What Could Add**:

- Stress tests with higher concurrency (100+ requests)
- Performance benchmarks
- Memory leak detection

---

### Phase 11.2: Production Smoke Tests

**Status**: Requires production deployment
**What Can Test**: Deploy suite to production and run basic health checks.

---

## Recommended Next Steps

### Priority 1: High Value, Easy to Implement

1. **Phase 7.1: Error Handling Tests** (Estimated: 10-15 tests)
   - Schema validation errors
   - StructuredError patterns
   - Error propagation
   - Error response formats

2. **Phase 7.2: Schema Validation Tests** (Estimated: 15-20 tests)
   - Input/output validation
   - Type coercion
   - Optional/default values
   - Complex schemas (nested objects, arrays, unions)

3. **Phase 6.1: Eval Framework Tests** (Estimated: 8-12 tests)
   - Create and run evals
   - Scoring and metrics
   - Eval result validation

### Priority 2: Medium Value, More Complex

4. **Phase 5.3: Event System Tests** (Estimated: 5-8 tests)
   - Event listeners
   - Event dispatch
   - Event payloads

5. **Phase 11.1: Enhanced Load Tests** (Estimated: 5-10 tests)
   - Higher concurrency tests
   - Performance benchmarks
   - Timeout handling

### Priority 3: Different Testing Approach Needed

6. **React Component Tests** - Separate test suite with Vitest
7. **WebSocket/SSE Tests** - Separate test suite with connection clients
8. **Thread Persistence Tests** - HTTP-based test suite with fetch
9. **DevMode Tests** - E2E tests with actual CLI
10.   **APIClient Tests** - Unit tests in packages/server/test/

---

## Summary

**Current Coverage**: 71 tests covering core agent functionality, routing, all storage services, sessions, and background tasks.

**Recommended Next**: Focus on Error Handling (Phase 7.1) and Schema Validation (Phase 7.2) as they are:

- Highly testable with `agent.run()`
- High value for SDK validation
- Relatively easy to implement
- Cover important edge cases

**After That**: Eval Framework tests (Phase 6.1) to validate the eval system.

**Long Term**: Create separate test suites for React components, WebSocket/SSE, and E2E scenarios that can't be tested with `agent.run()`.
