# Agentuity Agent Skills

A collection of [Agent Skills](https://agentskills.io/) for AI coding agents working with the Agentuity SDK.

## Available Skills

### agentuity-agents

Build agents with the Agentuity Runtime SDK. Covers `createAgent`, schema validation with `@agentuity/schema`, the full AgentContext API (`ctx.logger`, `ctx.kv`, `ctx.vector`, `ctx.thread`, `ctx.session`, etc.), inter-agent calls, streaming, background tasks, and evaluations.

**Use when:**
- Creating or modifying agents
- Working with agent schemas and validation
- Using platform services (KV, Vector, Storage) from agent code
- Managing state (thread, session, request)

### agentuity-routing

Build API routes, middleware, and real-time handlers. Covers `createRouter`, Hono-based routing, `agent.validator()`, WebSocket/SSE/WebRTC/cron handlers, CORS configuration, and request/response patterns.

**Use when:**
- Creating API endpoints
- Adding middleware or authentication
- Setting up WebSocket or SSE connections
- Configuring CORS or route validation

### agentuity-cli

Use the Agentuity CLI for project management, development, and cloud services. Covers `agentuity new`, dev server, build/deploy, environment variables, and all cloud service commands (KV, Vector, Storage, Sandbox, Database, Queue, Email, SSH).

**Use when:**
- Scaffolding a new project
- Running dev server or deploying
- Managing cloud resources from the terminal
- Working with environment variables

### agentuity-workbench

Set up and use the Workbench dev UI for interactive agent testing. Covers the built-in testing interface, schema inspection, chat UI, and embedding workbench components in custom frontends.

**Use when:**
- Testing agents during development
- Inspecting agent schemas visually
- Setting up the dev testing UI
- Embedding workbench components

## Installation

```bash
# Install all skills
npx skills add agentuity/sdk

# Install a specific skill
npx skills add agentuity/sdk --skill agentuity-agents

# Install to a specific agent
npx skills add agentuity/sdk -a claude-code
npx skills add agentuity/sdk -a pi
npx skills add agentuity/sdk -a cursor
```

## Skill Format

Each skill follows the [Agent Skills specification](https://agentskills.io/specification):

```
skills/
├── agentuity-agents/
│   └── SKILL.md
├── agentuity-routing/
│   └── SKILL.md
├── agentuity-cli/
│   └── SKILL.md
└── agentuity-workbench/
    └── SKILL.md
```

## License

Apache-2.0
