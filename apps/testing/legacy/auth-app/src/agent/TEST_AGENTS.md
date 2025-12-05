# Integration Test Agents

This directory contains agents for end-to-end integration testing. These agents test real runtime behavior, not individual functions (those are unit tested in `packages/runtime/test/`).

## Available Test Agents

### Simple (`/agent/simple`)

Basic agent for testing server lifecycle and basic request/response flow.

### Async (`/agent/async`)

Tests async handler execution.

### Cron (`/agent/cron`)

Tests cron schedule validation (if cron service is implemented).

### Email (`/agent/email`)

Tests email service integration (if email service exists).

### SMS (`/agent/sms`)

Tests SMS service integration (if SMS service exists).

### State (`/agent/state`)

Tests state persistence across requests.

### Team (`/agent/team`)

Tests subagent hierarchy (parent/child relationships).

### Metadata Type Test (`/agent/metadata-type-test`)

Tests metadata type safety and validation.

## Running the Test App

### Start the Server

```bash
cd sdk/apps/testing/auth-app
bun run build
bun run dev
```

Server will be available at http://localhost:3500

### Test Agents

```bash
# Test simple agent
curl http://localhost:3500/agent/simple --json '{"name":"Test","age":25}'

# Test team subagents
curl http://localhost:3500/agent/team
```

## What These Tests Verify

1. **Server Lifecycle** - Server starts, serves requests, shuts down gracefully
2. **Agent Execution** - Agents execute handlers correctly
3. **Type Safety** - Full type checking at build time
4. **Metadata Generation** - Agent metadata properly generated
5. **Registry Generation** - Agent registry provides type-safe access
6. **End-to-End Flow** - HTTP → Router → Agent → Response

## For Service Usage Examples

Service CRUD operations (KeyValue, Vector, ObjectStore, Stream) have been moved to **examples** and are covered by **unit tests**.

See:

- `sdk/examples/services-keyvalue/` - KeyValue usage patterns
- `sdk/packages/runtime/test/` - Unit tests for all services

## For Feature Demonstrations

Feature demos (events, evals, lifecycle, AI SDK, streaming, WebSocket, SSE) have been moved to **examples**.

See:

- `sdk/examples/events/` - Event listener patterns
- `sdk/examples/evals/` - Eval creation patterns
- `sdk/examples/lifecycle/` - Setup/shutdown patterns
- `sdk/examples/ai-sdk/` - AI SDK integration
- `sdk/examples/streaming/` - Streaming responses
- `sdk/examples/websocket/` - WebSocket connections
- `sdk/examples/sse/` - Server-Sent Events

## Adding a New Integration Test

Integration tests should focus on end-to-end scenarios that require a real server:

1. Create agent: `src/agent/your-test/agent.ts`
2. Export: `export default createAgent('your-test', { ... })`
3. Rebuild: `bun run build`
4. Add Bun test: `test/integration/your-test.test.ts`
5. Use helpers from `test/helpers/server.ts`
