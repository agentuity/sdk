# Agentuity Coder

A [Claude Code plugin](https://code.claude.com/docs/en/plugins) that adds a team of specialized AI agents with persistent memory and access to [Agentuity](https://agentuity.dev) cloud services.

## Prerequisites

- [Claude Code](https://code.claude.com) installed and authenticated
- [Agentuity CLI](https://agentuity.dev) installed and authenticated (`agentuity auth login`)
- [Bun](https://bun.sh/) runtime

The Agentuity CLI provides cloud services (KV, Vector, Storage, Sandbox, DB, SSH) and persistent memory. The plugin works without it, but memory and cloud features will be unavailable.

## Installation

```bash
# Via Agentuity CLI (recommended)
agentuity ai claude-code install

# Via Claude Code marketplace
/plugin marketplace add agentuity/sdk
/plugin install agentuity-coder@agentuity
```

## Usage

```
/agentuity-coder implement dark mode for the settings page
/agentuity-cadence build the payment integration with tests
/agentuity-memory-save
```

| Command | Description |
| --- | --- |
| `/agentuity-coder` | Run a task with the full agent team |
| `/agentuity-cadence` | Start autonomous long-running task execution |
| `/agentuity-cadence-cancel` | Cancel an active Cadence session |
| `/agentuity-memory-save` | Save session context to cloud memory |
| `/agentuity-memory-share` | Share content via Agentuity Cloud Streams |
| `/agentuity-sandbox` | Run code in an isolated sandbox |

Agents also activate automatically based on context. You don't always need a slash command.

## Agents

Seven agents with distinct roles, each running on a model tier suited to their task:

| Agent | Role | Model |
| --- | --- | --- |
| **Lead** | Orchestrator -- plans, delegates, synthesizes | opus |
| **Scout** | Explorer -- codebase research, read-only | haiku |
| **Builder** | Implementer -- code changes, tests, builds | sonnet |
| **Architect** | Autonomous implementer -- complex multi-file work | opus |
| **Reviewer** | Code reviewer -- catches issues, verifies quality | sonnet |
| **Memory** | Context manager -- stores/recalls across sessions | haiku |
| **Product** | Requirements owner -- PRDs, feature planning | sonnet |

Lead handles delegation automatically. For most tasks, just describe what you want and the right agents are chosen for you.

## Skills

Skills inject Agentuity SDK expertise into the conversation automatically when relevant:

| Skill | Covers |
| --- | --- |
| **agentuity-backend** | `@agentuity/runtime`, `@agentuity/schema`, `@agentuity/drizzle`, `@agentuity/postgres`, `@agentuity/evals` |
| **agentuity-frontend** | `@agentuity/react`, `@agentuity/auth`, `@agentuity/frontend`, `@agentuity/workbench` |
| **agentuity-ops** | CLI commands, cloud services, deployments |
| **agentuity-cloud** | Package routing, ecosystem overview |
| **agentuity-command-runner** | Runtime detection, build/test/lint execution |
| **agentuity-reasoning** | Conclusion extraction, memory reasoning |

## Memory

Persistent context across sessions via Agentuity Cloud:

- **KV Storage** for structured data (patterns, decisions, corrections)
- **Vector Storage** for semantic search over session history
- **Entity-centric** -- tracks users, orgs, projects, repos
- **Branch-aware** -- scopes memories to git branch context

Use `/agentuity-memory-save` after completing work to persist decisions and lessons learned.

## Cadence Mode

Cadence runs the agent team autonomously across multiple iterations until a task is complete.

```
/agentuity-cadence build the auth system with OAuth, session management, and tests
```

How it works:
1. A Stop hook intercepts session end and re-injects the task prompt
2. Memory checkpoints at each iteration for recovery
3. The loop continues until the agent signals `<promise>DONE</promise>` or max iterations is reached
4. Use `--max-iterations N` to cap iterations (default: 50)

Cancel with `/agentuity-cadence-cancel` or `Ctrl+C`.

## Hooks

The plugin registers event hooks that run automatically:

| Script | Event | What It Does |
| --- | --- | --- |
| `session-start.sh` | SessionStart | Detects Agentuity project, org, user, and git context |
| `session-end.sh` | SessionEnd | Saves session memory (immediate KV + async processing) |
| `block-sensitive-commands.sh` | PreToolUse | Blocks access to secrets, API keys, auth tokens |
| `pre-compact.sh` | PreCompact | Saves memory before context window compaction |
| `cadence-stop.sh` | Stop | Keeps the Cadence loop running until task is done |
| `stop-memory-save.sh` | Stop | Prompts memory save before session ends |

## Permissions

The install script configures Claude Code permissions in `~/.claude/settings.local.json`:

**Allowed** -- `agentuity cloud *` and `agentuity auth whoami *`

**Blocked** -- `agentuity cloud secrets *`, `agentuity cloud secret *`, `agentuity cloud apikey *`, `agentuity auth token *`

Deny rules take precedence. The PreToolUse hook adds a second layer blocking sensitive commands before they reach the permission system.

## Cloud Services

Agents can use any `agentuity cloud` subcommand:

| Service | Examples |
| --- | --- |
| **KV** | Key-value storage for structured data |
| **Vector** | Semantic search over stored content |
| **Storage** | File upload/download |
| **Sandbox** | Isolated code execution environments |
| **Database** | Postgres via `agentuity cloud db` |
| **SSH** | Connect to deployments |

## Development

```bash
# Build
cd packages/claude-code && bun run build

# Test locally
claude --plugin-dir /path/to/sdk/packages/claude-code

# Validate
claude plugin validate /path/to/sdk/packages/claude-code
```

### Project Structure

```
packages/claude-code/
├── .claude-plugin/plugin.json   # Plugin manifest
├── agents/                      # 7 agent definitions (markdown)
├── skills/                      # 6 auto-activated skills (SKILL.md)
├── commands/                    # 6 slash commands (markdown)
├── hooks/
│   ├── hooks.json               # Hook event configuration
│   └── scripts/                 # 7 shell scripts
├── src/install.ts               # Install script (permissions setup)
├── LICENSE
└── README.md
```

## License

Apache-2.0
