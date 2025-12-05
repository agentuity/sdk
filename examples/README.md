# Agentuity SDK Examples

This directory contains example projects demonstrating various Agentuity features and patterns.

## Available Examples

### 🤖 AI & Streaming

#### [ai-sdk](./ai-sdk/)

AI SDK integration with streaming LLM responses using Vercel AI SDK.

**Demonstrates:**

- OpenAI integration
- Streaming AI responses
- Type-safe LLM interactions

#### [streaming](./streaming/)

Streaming responses using ReadableStream for chunked data delivery.

**Demonstrates:**

- ReadableStream API
- Chunked responses
- Memory-efficient streaming

### 📡 Real-Time Communication

#### [websocket](./websocket/)

Bidirectional WebSocket communication patterns.

**Demonstrates:**

- WebSocket server setup
- Bidirectional messaging
- Connection lifecycle management

#### [sse](./sse/)

Server-Sent Events for one-way server→client updates.

**Demonstrates:**

- SSE endpoint creation
- Real-time updates
- Automatic reconnection

### 🔧 Agent Patterns

#### [events](./events/)

Agent event listeners for tracking execution lifecycle.

**Demonstrates:**

- Event listeners (started, completed, errored)
- State tracking
- Execution monitoring

#### [evals](./evals/)

Agent evaluations for testing quality and correctness.

**Demonstrates:**

- Creating eval functions
- Automatic eval execution
- Quality testing patterns

#### [lifecycle](./lifecycle/)

Agent setup and shutdown hooks for resource management.

**Demonstrates:**

- Setup initialization
- Shutdown cleanup
- Config management

### 💾 Storage Services

#### [services-keyvalue](./services-keyvalue/)

KeyValue storage service usage patterns.

**Demonstrates:**

- KV CRUD operations
- TTL management
- Store organization

## Running Examples

Each example is a standalone Agentuity application:

```bash
cd examples/[example-name]
bun install
bun run build
bun run dev
```

Server will start on http://localhost:3500

## Example Structure

Each example follows this structure:

```
example-name/
├── README.md           # Documentation and usage
├── package.json        # Dependencies and scripts
└── src/
    ├── app.ts          # App setup
    └── agent/          # Agent implementations
        └── agent-name/
            └── agent.ts
```

## For Testing

Examples are for **demonstration and documentation**, not for automated testing.

For testing:

- **Unit tests** - See `packages/runtime/test/`
- **Integration tests** - See `apps/testing/auth-app/test/`

## Contributing

When adding a new example:

1. Create directory: `examples/your-example/`
2. Copy structure from existing example
3. Create README.md with:
   - Feature description
   - Usage instructions
   - Code examples
   - Use cases
   - Best practices
4. Add entry to this index

## Categories

| Category           | Examples                 | Description                                 |
| ------------------ | ------------------------ | ------------------------------------------- |
| **AI & Streaming** | ai-sdk, streaming        | AI integration and data streaming           |
| **Real-Time**      | websocket, sse           | Bidirectional and server-push communication |
| **Agent Patterns** | events, evals, lifecycle | Agent features and lifecycle                |
| **Storage**        | services-keyvalue        | Data persistence patterns                   |

## Quick Start

**New to Agentuity?** Start with:

1. [services-keyvalue](./services-keyvalue/) - Simple storage patterns
2. [events](./events/) - Understanding agent lifecycle
3. [streaming](./streaming/) - Async responses

**Advanced patterns?** Check out:

1. [ai-sdk](./ai-sdk/) - AI integration
2. [websocket](./websocket/) - Real-time communication
3. [evals](./evals/) - Quality testing

## Resources

- [Agentuity Documentation](https://agentuity.com/docs)
- [SDK Reference](../packages/)
- [Test Apps](../apps/testing/) - Integration testing examples
