# Integration Suite

End-to-end integration testing suite for the Agentuity SDK.

## Overview

This app provides comprehensive integration tests for all SDK functionality. Tests run in a single server instance and can be triggered via HTTP endpoints with real-time SSE streaming of results.

## Quick Start

```bash
# Install dependencies (from SDK root)
cd sdk
bun install

# Build the integration suite
cd apps/testing/integration-suite
bun run build

# Run the server
bun run dev
```

Server starts on port 3600 (configured in `agentuity.json`).

## Running Tests

### Trigger All Tests

```bash
curl http://localhost:3600/api/test/run
```

### Filter by Suite

```bash
curl http://localhost:3600/api/test/run?suite=basic
```

### Filter by Test Name

```bash
curl http://localhost:3600/api/test/run?test=simple
```

### Control Concurrency

```bash
curl http://localhost:3600/api/test/run?concurrency=20
```

### Watch SSE Stream

```bash
curl -N http://localhost:3600/api/test/run
```

The `-N` flag disables buffering so you see results in real-time.

## API Endpoints

- `GET /health` - Health check
- `GET /api/test/run` - Run tests with SSE streaming
- `GET /api/test/suites` - List available test suites
- `GET /api/test/list` - List all tests (optional `?suite=<name>` filter)

## SSE Event Format

### Start Event

```
event: start
data: {"type":"start","summary":{"total":10,"passed":0,"failed":0,"duration":0}}
```

### Progress Event

```
event: progress
data: {"type":"progress","test":"basic:simple","passed":true,"duration":12.5}
```

### Error Event

```
event: progress
data: {"type":"progress","test":"basic:failing","passed":false,"error":"Assertion failed","stack":"...","duration":5.2}
```

### Complete Event

```
event: complete
data: {"type":"complete","summary":{"total":10,"passed":8,"failed":2,"duration":125.7}}
```

## Test Structure

Tests are organized by suite and registered using the `test()` function:

```typescript
import { test } from '../test/suite';

test('basic', 'simple', async () => {
	// Your test code here
});
```

## Test Isolation

Each test should use unique IDs to ensure isolation:

```typescript
import { uniqueId } from '../test/helpers';

test('storage', 'kv-set', async () => {
	const key = uniqueId('kv-test');
	// Use key in test...
});
```

## Adding New Tests

1. Create agent/API/web route in appropriate directory
2. Create test file that registers tests with `test()` function
3. Import test file in app.ts or let bundler auto-discover
4. Rebuild and run

## Project Structure

```
src/
├── agent/       # Agent-based tests
├── api/         # API-only tests
├── web/         # React component tests
└── test/        # Test infrastructure
    ├── suite.ts    # Test registry
    ├── route.ts    # SSE endpoint
    └── helpers/    # Test utilities
```

## Development

- **Build**: `bun run build` - Compiles the app
- **Dev**: `bun run dev` - Runs the compiled app
- **Typecheck**: `bun run typecheck` - Type checking only

## CI/CD Integration

Parse SSE events to determine test success:

```bash
curl -N http://localhost:3600/api/test/run | \
  grep "event: complete" -A 1 | \
  grep "failed\":0" && echo "Tests passed" || echo "Tests failed"
```
