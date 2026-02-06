# Agent Guidelines for @agentuity/opencode

## Package Overview

OpenCode plugin providing a team of specialized AI agents for code assistance, with access to Agentuity's cloud platform for persistent memory, vector search, and key-value storage.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Test**: `bun run test`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Bun/Node compatible
- **Plugin target**: OpenCode CLI
- **Memory**: Agentuity Cloud (KV + Vector) for cross-session persistence

## Agent Team

| Agent       | Role                                                                |
| ----------- | ------------------------------------------------------------------- |
| `lead`      | Orchestrator - routes tasks to specialized agents                   |
| `scout`     | Explorer - analyzes codebases, finds patterns, researches docs      |
| `builder`   | Implementer - writes code, makes edits, runs tests                  |
| `architect` | Senior implementer - complex autonomous tasks, deep reasoning       |
| `reviewer`  | Code reviewer - reviews changes, catches issues, applies fixes      |
| `memory`    | Memory keeper - stores context in KV, semantic search via Vector    |
| `reasoner`  | Conclusion extractor - analyzes session data, surfaces corrections  |
| `expert`    | Agentuity specialist - knows CLI, SDK, cloud services deeply        |
| `runner`    | Command executor - runs lint/build/test/typecheck/format            |
| `product`   | Product strategy - drives clarity, validates features               |
| `monitor`   | Background watcher - monitors background tasks, reports completions |

## Structure

```text
src/
├── index.ts              # Plugin entrypoint
├── types.ts              # AgentRole, shared types
├── plugin/
│   ├── index.ts          # Plugin exports
│   ├── plugin.ts         # Main plugin configuration
│   └── hooks/            # OpenCode lifecycle hooks
│       ├── index.ts
│       ├── session.ts    # Session lifecycle
│       ├── session-memory.ts # Memory persistence hooks
│       ├── cadence.ts    # Cadence mode integration
│       ├── keyword.ts    # Keyword triggers
│       ├── params.ts     # Parameter extraction
│       └── tools.ts      # Tool registration
├── agents/
│   ├── index.ts          # Agent registry and exports
│   ├── types.ts          # AgentDefinition, AgentRegistry types
│   ├── lead.ts           # Lead agent (orchestrator)
│   ├── scout.ts          # Scout agent (explorer)
│   ├── builder.ts        # Builder agent (implementer)
│   ├── architect.ts      # Architect agent (senior implementer)
│   ├── reviewer.ts       # Reviewer agent
│   ├── memory.ts         # Memory agent
│   ├── reasoner.ts       # Reasoner agent
│   ├── expert.ts         # Expert agent (orchestrator for sub-experts)
│   ├── runner.ts         # Runner agent (command execution)
│   ├── product.ts        # Product agent
│   ├── monitor.ts        # Monitor agent
│   └── memory/           # Memory agent internals
│       ├── index.ts
│       ├── types.ts
│       └── entities.ts   # Entity extraction and management
├── tools/
│   ├── index.ts          # Tool exports
│   └── background.ts     # Background task tools
├── background/
│   ├── index.ts          # Background task exports
│   ├── manager.ts        # Task manager
│   ├── types.ts          # Task types
│   └── concurrency.ts    # Concurrency control
├── tmux/                 # Tmux integration for parallel execution
│   ├── index.ts
│   ├── manager.ts
│   ├── executor.ts
│   ├── decision-engine.ts
│   ├── state-query.ts
│   ├── utils.ts
│   └── types.ts
├── skills/               # Skill loading system
│   ├── index.ts
│   ├── loader.ts
│   ├── frontmatter.ts
│   └── types.ts
├── config/               # Configuration
│   ├── index.ts
│   ├── loader.ts
│   ├── presets.ts
│   └── validation.ts
├── services/             # Agentuity cloud adapters
│   ├── index.ts
│   └── auth.ts           # Authentication service
└── mcps/                 # Third-party MCP integrations
    ├── index.ts
    ├── context7.ts       # Context7 documentation lookup
    └── grep-app.ts       # grep.app code search
```

## Code Conventions

- Follow existing SDK patterns
- Use Zod for schema validation
- Agent system prompts are embedded in agent definition files
- Cloud services (KV, Vector) are accessed via Agentuity CLI commands
- Background tasks run in separate processes/sessions

## Memory System

The Memory agent uses Agentuity Cloud for persistence:

```typescript
// KV Storage - structured data
agentuity cloud kv set <namespace> <key> <value> --region <region>
agentuity cloud kv get <namespace> <key> --region <region>

// Vector Storage - semantic search
agentuity cloud vector upsert <namespace> <id> --document <text> --metadata <json> --region <region>
agentuity cloud vector search <namespace> <query> --region <region>
```

Sessions are stored with branch awareness to prevent stale memories from deleted branches being surfaced.

## Delegation Pattern

Lead delegates to specialized agents via two mechanisms:

- **Task tool** (blocking) — Spawns a subagent, waits for result. Use for sequential work.
- **`agentuity_background_task`** (parallel) — Launches a task in a separate session. Use for independent concurrent work.

## Testing

- Tests in `test/` directory
- Use `bun test` to run
- When running tests, prefer using a subagent (Task tool) to avoid context bloat from test output

## Publishing

1. Run `bun run build`
2. Run `bun run typecheck`
3. Run `bun run test`
4. Depends on `@agentuity/core`, `@agentuity/server`
