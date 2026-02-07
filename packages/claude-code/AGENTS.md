# Agentuity Coder for Claude Code

A team of specialized AI agents for code assistance with persistent memory via Agentuity Cloud.

## Architecture

### Agents (7)

| Agent | Role | Model | Description |
|-------|------|-------|-------------|
| **Lead** | Orchestrator | opus | Plans, delegates, synthesizes. The conductor. |
| **Scout** | Explorer | haiku | Read-only codebase research and pattern finding. |
| **Builder** | Implementer | sonnet | Writes code, runs tests, makes changes. |
| **Architect** | Senior Implementer | opus | Complex autonomous tasks, Cadence mode. |
| **Reviewer** | QA Lead | sonnet | Code review, catches issues, verifies quality. |
| **Memory** | Librarian | haiku | KV + Vector storage, cross-session recall. |
| **Product** | Requirements | sonnet | Feature planning, PRDs, requirements clarity. |

### Skills (6)

| Skill | Source | Description |
|-------|--------|-------------|
| **agentuity-backend** | Expert Backend | Runtime, agents, schemas, drizzle, postgres, evals |
| **agentuity-frontend** | Expert Frontend | React hooks, auth, workbench, web utilities |
| **agentuity-ops** | Expert Ops | CLI commands, cloud services, deployments |
| **agentuity-cloud** | Expert (overview) | Package routing, ecosystem overview |
| **agentuity-command-runner** | Runner | Build/test/lint execution methodology |
| **agentuity-reasoning** | Reasoner | Conclusion extraction, memory reasoning |

### Hooks (6)

| Hook | Event | Purpose |
|------|-------|---------|
| block-sensitive-commands.sh | PreToolUse (Bash) | Block access to secrets, API keys, auth tokens |
| pre-compact.sh | PreCompact | Inject memory-save instructions before compaction |
| cadence-stop.sh | Stop | Keep Cadence loop running until completion promise detected |
| stop-memory-save.sh | Stop | Request memory save before interactive session ends |
| session-start.sh | SessionStart | Gather Agentuity context (project, org, user) |
| session-end.sh | SessionEnd | Dual-path memory save: immediate KV + async agentic processing |

### Commands (6)

| Command | Description |
|---------|-------------|
| /agentuity-coder | Activate full team orchestration via Lead |
| /agentuity-cadence | Start a long-running Cadence loop (autonomous task completion) |
| /agentuity-cadence-cancel | Cancel an active Cadence loop |
| /agentuity-memory-save | Save session to Agentuity Cloud memory |
| /agentuity-memory-share | Share content publicly via Agentuity Cloud Streams |
| /agentuity-sandbox | Agentuity sandboxes (isolated execution environments) |

## Delegation Flow

```
User Request → Lead (classify, plan)
  → Scout (explore codebase)
  → Builder/Architect (implement)
  → Reviewer (verify)
  → Memory (store context)
  → Product (validate requirements)
```

## Memory System

Memory uses Agentuity Cloud for persistent storage:
- **KV Storage**: Structured data (patterns, decisions, corrections, entities)
- **Vector Storage**: Semantic search over session history
- **Entity-Centric**: Tracks users, orgs, projects, repos across sessions
- **Branch-Aware**: Filters memories by git branch context

## Cloud Services

Agents can use Agentuity Cloud services via CLI:
- KV Storage (`agentuity cloud kv`)
- Vector Search (`agentuity cloud vector`)
- Object Storage (`agentuity cloud storage`)
- Sandboxes (`agentuity cloud sandbox`)
- Postgres (`agentuity cloud db`)
- SSH (`agentuity cloud ssh`)
