# Service Test Agents

This directory contains test agents for manually verifying service integrations. Each agent exercises the corresponding service's API to ensure it works correctly in a real application context.

## Available Test Agents

### KeyValue (`/agent/keyvalue`)

Tests the KeyValueStorage service with CRUD operations.

**Operations:**

- `set` - Store a value with TTL
- `get` - Retrieve a value
- `delete` - Delete a value

**Example GET:**

```bash
curl http://localhost:3500/agent/keyvalue
```

**Example POST:**

```bash
# Set a value
curl http://localhost:3500/agent/keyvalue \
  --json '{"operation":"set","key":"my-key","value":"my-value"}'

# Get a value
curl http://localhost:3500/agent/keyvalue \
  --json '{"operation":"get","key":"my-key"}'

# Delete a value
curl http://localhost:3500/agent/keyvalue \
  --json '{"operation":"delete","key":"my-key"}'
```

### Vector (`/agent/vector`)

Tests the VectorStorage service with all operations including semantic search.

**Operations:**

- `upsert` - Store document(s) with embeddings
- `get` - Retrieve vector by key (returns discriminated union)
- `getMany` - Batch retrieve vectors
- `search` - Semantic search with similarity threshold
- `delete` - Delete vector(s)
- `exists` - Check if storage exists

**Example GET:**

```bash
curl http://localhost:3500/agent/vector
```

**Example POST:**

```bash
# Upsert a document
curl http://localhost:3500/agent/vector \
  --json '{
    "operation":"upsert",
    "key":"doc1",
    "document":"Machine learning is amazing",
    "category":"AI"
  }'

# Search for similar documents
curl http://localhost:3500/agent/vector \
  --json '{
    "operation":"search",
    "query":"artificial intelligence",
    "category":"AI"
  }'

# Get a specific vector
curl http://localhost:3500/agent/vector \
  --json '{"operation":"get","key":"doc1"}'

# Get multiple vectors
curl http://localhost:3500/agent/vector \
  --json '{"operation":"getMany","keys":["doc1","doc2","doc3"]}'

# Check if storage exists
curl http://localhost:3500/agent/vector \
  --json '{"operation":"exists"}'

# Delete vectors
curl http://localhost:3500/agent/vector \
  --json '{"operation":"delete","keys":["doc1"]}'
```

## Running the Test App

### Start the Server

```bash
cd test-app
bun run build
bun run dev
```

Server will be available at http://localhost:3500

### Test All Services

```bash
# Test KeyValue
curl http://localhost:3500/agent/keyvalue

# Test Vector
curl http://localhost:3500/agent/vector
```

### Stop the Server

```bash
lsof -ti:3500 | xargs kill -9
```

## What These Tests Verify

1. **Service Integration** - Service is properly registered in context
2. **Type Safety** - Full autocomplete and type checking in agent code
3. **API Functionality** - All service operations work correctly
4. **Error Handling** - Errors are properly propagated
5. **Telemetry** - Operations are traced (check logs)
6. **End-to-End Flow** - Agent → Service → Platform API → Response

## Adding a New Test Agent

When you create a new service, add a test agent:

1. Create directory: `test-app/src/agents/yourservice/`
2. Create `agent.ts` with operations testing your service
3. Create `route.ts` with GET and POST endpoints
4. Rebuild: `bun run build`
5. Test via HTTP requests

See [howto_new_service.md](../../packages/core/docs/howto_new_service.md) for detailed instructions.
