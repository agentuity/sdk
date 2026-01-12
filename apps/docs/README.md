# Agentuity SDK Explorer

An interactive showcase of the Agentuity v1 SDK.

**Explore the Agentuity v1 SDK through interactive demos with a React frontend.**

Learn by doing - every feature has working code you can test, modify, and use as reference.

## What is the SDK Explorer?

The SDK Explorer is a full-stack reference implementation showcasing the Agentuity v1 SDK:

- **Interactive demos** with a React frontend - test features in your browser
- **Working code examples** for every SDK capability
- **Real agent implementations** you can customize and extend
- **Modern stack** with TypeScript, React 19, and Tailwind CSS

### Key Benefits

- **Visual Learning**: See results instantly through the web UI
- **Code-Along Experience**: View source code alongside running demos
- **Copy-Paste Ready**: Each demo is a working implementation you can adapt
- **Full-Stack Reference**: Covers agents, routes, and frontend integration

## Quick Start

1. **Clone and install**:

```bash
git clone https://github.com/agentuity/sdk-explore.git
cd sdk-explore
bun install
```

2. **Start the development server**:

```bash
bun run dev
```

3. **Open the UI** at http://localhost:3500 and explore the demos

4. **Deploy your changes** when ready:

```bash
bun run deploy
```

## Prerequisites

### Required

- **Bun**: Version 1.2.4 or higher
- **Agentuity CLI**: Install with `npm install -g @agentuity/cli`
- **Agentuity account**: Sign up at [agentuity.com](https://app.agentuity.com/sign-up)

### Optional

For local development without an Agentuity account, set provider API keys in `.env`:

- **`OPENAI_API_KEY`**: For OpenAI models
- **`ANTHROPIC_API_KEY`**: For Anthropic models
- **`GOOGLE_GENERATIVE_AI_API_KEY`**: For Google Gemini models
- **`GROQ_API_KEY`**: For Groq models (used in Model Arena judging)

When these are set, the AI SDK calls providers directly (bypassing the AI Gateway).

## Available Demos

Each demo showcases specific v1 SDK features. The table below maps to interactive cards in the web UI.

### Basics

| Demo                | What It Demonstrates                                     |
| :------------------ | :------------------------------------------------------- |
| **Hello Agent**     | Basic request/response pattern with schema validation    |
| **Handler Context** | Access session ID, thread state, and services from `ctx` |

### Services

| Demo               | What It Demonstrates                                       |
| :----------------- | :--------------------------------------------------------- |
| **KV Storage**     | Key-value storage with TTL, namespaces, and key listing    |
| **Vector Search**  | Semantic search with auto-embedding and AI recommendations |
| **Object Storage** | File storage using Bun's S3 API with presigned URLs        |
| **AI Gateway**     | Multi-provider LLM routing with a single API key           |

### I/O Patterns

| Demo                | What It Demonstrates                                       |
| :------------------ | :--------------------------------------------------------- |
| **Text Stream**     | Raw streaming responses via `router.stream()`              |
| **SSE Stream**      | Server-Sent Events with event types, IDs, and reconnection |
| **Durable Streams** | Persistent streams with shareable public URLs              |
| **Agent Calls**     | Sync, background, and chained agent invocation patterns    |
| **Cron Jobs**       | Scheduled task execution with cron expressions             |

### Examples

| Demo            | What It Demonstrates                                    |
| :-------------- | :------------------------------------------------------ |
| **Chat**        | Multi-turn conversation with thread-based memory        |
| **Model Arena** | Compare AI models using LLM-as-judge evaluation         |
| **Evals**       | Automatic quality checks that run after agent responses |

## How to Use

### Exploring Demos

1. Open http://localhost:3500 in your browser
2. Click any demo card to see it in action
3. The left panel shows the interactive demo; the right panel shows the code

### Understanding the Code

Each demo has three parts:

- **Agent** (`src/agent/*/agent.ts`) - Core logic with schema validation
- **Route** (`src/api/*/route.ts`) - HTTP transport layer
- **Component** (`src/web/components/*.tsx`) - React UI

### Testing with Workbench

For raw agent testing without the frontend, use the built-in Workbench:

1. Run `bun run dev`
2. Open http://localhost:3500/workbench
3. Select an agent and send JSON payloads directly

## Project Structure

```
sdk-explore/
├── src/
│   ├── agent/              # Agent implementations
│   │   ├── hello/          # Basic greeting agent
│   │   ├── chat/           # Conversational agent with memory
│   │   ├── kv/             # Key-value storage operations
│   │   ├── vector/         # Semantic search agent
│   │   ├── evals/          # Agent with quality evaluations
│   │   └── model-arena/    # Multi-model comparison
│   ├── api/                # HTTP routes
│   │   ├── index.ts        # Route aggregation
│   │   ├── hello/          # Routes for hello agent
│   │   ├── streaming/      # Raw streaming endpoint
│   │   ├── sse-stream/     # SSE streaming endpoint
│   │   ├── websocket/      # WebSocket endpoint
│   │   └── durable-stream/ # Persistent stream endpoint
│   ├── web/                # React frontend
│   │   ├── App.tsx         # Main app with demo config
│   │   ├── frontend.tsx    # Entry point
│   │   └── components/     # Demo components
│   └── generated/          # Auto-generated route types
├── app.ts                  # Application entry point
├── agentuity.config.ts     # Workbench and plugin config
├── agentuity.json          # Project metadata
└── package.json            # Dependencies and scripts
```

## Available Commands

```bash
# Development
bun run dev          # Start dev server at http://localhost:3500

# Building
bun run build        # Compile for deployment

# Quality
bun run typecheck    # Run TypeScript type checking

# Deployment
bun run deploy       # Deploy to Agentuity cloud
```

## v1 SDK Highlights

This project demonstrates several features new to the v1 SDK:

- **Thread State**: Persistent conversation memory with `ctx.thread.state.push()`
- **Evaluations**: Quality checks via `agent.createEval()` that run after responses
- **Durable Streams**: Persistent streams with public URLs via `ctx.stream.create()`
- **Route Validation**: Type-safe requests using `agent.validator()` middleware
- **React Hooks**: `useAPI`, `useWebsocket`, and `useEventStream` for frontend integration
- **WebSocket Routes**: Real-time bidirectional communication via `router.websocket()`
- **SSE Routes**: Structured streaming with `router.sse()` and `stream.writeSSE()`

## Resources

- **Web App**: [app-v1.agentuity.com](https://app-v1.agentuity.com/)
- **Documentation**: [preview.agentuity.dev](https://preview.agentuity.dev)
- **Discord Community**: [Join our Discord](https://discord.gg/agentuity)
