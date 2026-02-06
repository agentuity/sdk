# @agentuity/claude-code

A Claude Code plugin providing a team of specialized AI agents with access to Agentuity cloud services and SDK expertise.

## Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- [Agentuity CLI](https://agentuity.dev) installed and authenticated (`agentuity auth login`)
- [Bun](https://bun.sh/) runtime (Agentuity projects are Bun-native)

The Agentuity CLI is required for cloud services (KV, Vector, Storage, Sandbox, DB, SSH) and memory persistence. The plugin works without it, but memory and cloud features will be unavailable.

## Installation

```bash
# Via Agentuity CLI
agentuity ai claude-code install
```

This registers the plugin with Claude Code and configures it for your current project.

## Usage

Use slash commands to activate the agent team:

```
/agentuity-coder implement dark mode for settings page
/agentuity-coder review the auth module for security issues
/agentuity-cadence build the new auth feature with tests
/agentuity-memory-save
/agentuity-sandbox run bun test
```

You can also use agents directly without the `/agentuity-coder` command — Claude Code will trigger agents automatically based on context. The Lead agent orchestrates multi-step tasks, but individual agents like Scout or Reviewer can be invoked directly via the Task tool.

## Commands

| Command | Description |
| --- | --- |
| `/agentuity-coder` | Run tasks with the full agent team (Lead orchestrates) |
| `/agentuity-cadence` | Start a long-running Cadence loop (autonomous task completion) |
| `/agentuity-cadence-cancel` | Cancel an active Cadence loop |
| `/agentuity-memory-save` | Save session context to Agentuity Cloud memory |
| `/agentuity-memory-share` | Share content publicly via Agentuity Cloud Streams |
| `/agentuity-sandbox` | Agentuity sandboxes (isolated execution environments) |

### Cloud Services via Agents

Agents can operate any `agentuity cloud` subcommand directly:

| Service | CLI | Examples |
| --- | --- | --- |
| **KV** | `agentuity cloud kv` | `list namespaces`, `set key value` |
| **Storage** | `agentuity cloud storage` | `upload file`, `list buckets` |
| **Vector** | `agentuity cloud vector` | `search for auth patterns` |
| **Sandbox** | `agentuity cloud sandbox` | `run tests`, `create environment` |
| **Database** | `agentuity cloud db` | `create table`, `run SQL` |
| **SSH** | `agentuity cloud ssh` | `connect to deployment` |
| **Deployments** | `agentuity cloud deployment` | `list`, `inspect` |

## Agent Team

| Agent | Role | Model | When to Use |
| --- | --- | --- | --- |
| **Lead** | Orchestrator | opus | Automatically coordinates all work, handles strategic planning |
| **Scout** | Explorer | haiku | Finding files, patterns, codebase analysis (read-only) |
| **Builder** | Implementer | sonnet | Code changes, quick fixes, running tests and builds |
| **Architect** | Autonomous Implementer | opus | Cadence mode, complex multi-file features, long-running tasks |
| **Reviewer** | Code Reviewer | sonnet | Reviewing changes, catching issues, suggesting fixes |
| **Memory** | Context Manager | haiku | Storing/retrieving context, decisions, patterns across sessions |
| **Product** | Requirements Owner | sonnet | Define what to build and why, PRDs, validate product intent |

### Builder vs Architect

| Aspect | Builder | Architect |
| --- | --- | --- |
| **Mode** | Interactive | Autonomous |
| **Best for** | Quick fixes, guided work | Cadence mode, complex features |
| **Model** | Claude Sonnet | Claude Opus |
| **Context** | Session-based | Checkpoint-based |

**Use Builder when:** You're working interactively, making quick changes, or need guidance.

**Use Architect when:** Running Cadence mode, implementing complex multi-file features, or need autonomous execution with deep reasoning.

### Agent Delegation

Agents are invoked via Claude Code's Task tool with the `subagent_type` parameter:

```
agentuity-coder:agentuity-coder-lead      # Lead orchestrator
agentuity-coder:agentuity-coder-scout     # Read-only explorer
agentuity-coder:agentuity-coder-builder   # Code implementer
agentuity-coder:agentuity-coder-architect # Complex autonomous tasks
agentuity-coder:agentuity-coder-reviewer  # Code reviewer
agentuity-coder:agentuity-coder-memory    # Memory manager
agentuity-coder:agentuity-coder-product   # Product strategy
```

The Lead agent handles delegation automatically — you don't need to invoke agents directly unless you want to.

## Model Configuration

Each agent has a default model optimized for its role:

| Agent | Default Model | Purpose |
| --- | --- | --- |
| Lead | opus | Maximum reasoning for orchestration |
| Scout | haiku | Fast, cheap for read-only exploration |
| Builder | sonnet | Balanced for code implementation |
| Architect | opus | Deep reasoning for complex tasks |
| Reviewer | sonnet | Thorough analysis for code review |
| Memory | haiku | Fast for storage operations |
| Product | sonnet | Balanced for requirements analysis |

Models are configured in the agent markdown files (`agents/*.md`) via the `model` frontmatter field. Claude Code maps these to the latest available model in each tier.

## Skills

Skills are automatically activated based on context. Agents don't need to be told which skill to use — Claude Code loads the relevant skill when the conversation matches its description.

| Skill | Domain | What It Covers |
| --- | --- | --- |
| **agentuity-backend** | Backend | `@agentuity/runtime`, `@agentuity/schema`, `@agentuity/drizzle`, `@agentuity/postgres`, `@agentuity/evals` |
| **agentuity-frontend** | Frontend | `@agentuity/react`, `@agentuity/auth`, `@agentuity/frontend`, `@agentuity/workbench` |
| **agentuity-ops** | Ops | CLI commands, cloud services (KV, Vector, Storage, Sandbox, DB, SSH), deployments |
| **agentuity-cloud** | Overview | Package routing, ecosystem overview, cross-domain patterns |
| **command-runner** | DevOps | Runtime detection, build/test/lint execution, structured output parsing |
| **reasoning** | Memory | Conclusion extraction, validity checking, conflict resolution |

## Memory System

Memory uses Agentuity Cloud for persistent storage across sessions:

- **KV Storage**: Structured data (patterns, decisions, corrections, entities)
- **Vector Storage**: Semantic search over session history
- **Entity-Centric**: Tracks users, orgs, projects, repos across sessions
- **Branch-Aware**: Filters memories by git branch context
- **Corrections First**: Mistakes and lessons learned are highest priority

### How Memory Works

1. **Recall**: At the start of a task, Lead can ask Memory to search for relevant context from past sessions
2. **Store**: After completing work, use `/agentuity-memory-save` to persist the session's decisions, patterns, and corrections
3. **KV for structured data**: Key-value pairs stored via `agentuity cloud kv` (e.g., `correction:use-bun-not-npm`)
4. **Vector for semantic search**: Full session summaries stored via `agentuity cloud vector` for natural language recall

Memory requires the Agentuity CLI to be installed and authenticated.

## Hooks

| Hook | Event | Purpose |
| --- | --- | --- |
| `block-sensitive-commands.sh` | PreToolUse (Bash) | Block access to secrets, API keys, and auth tokens |
| `pre-compact.sh` | PreCompact | Inject memory-save instructions before context compaction |
| `cadence-stop.sh` | Stop | Keep Cadence loop running until `<promise>DONE</promise>` detected |
| `stop-memory-save.sh` | Stop | Request memory save before session ends (blocks first stop only) |
| `session-start.sh` | SessionStart | Gather Agentuity context (project, org, git branch) |
| `session-end.sh` | SessionEnd | Dual-path memory save: immediate KV + async agentic processing |

### SessionStart Hook

Runs automatically when a Claude Code session begins. It:

1. Walks up directories to find `agentuity.json`
2. Extracts `projectId` and `orgId` from the config
3. Falls back to `~/.config/agentuity/production.yaml` for `orgId` if not in project config
4. Runs `agentuity auth whoami --json` for user context
5. Captures current git branch and remote
6. Outputs JSON context available to all agents

This means agents automatically know which Agentuity project and org they're working in.

## Permissions

The install script automatically configures Claude Code permissions in `~/.claude/settings.local.json`:

**Auto-allowed** (no prompts):
- `Bash(agentuity cloud *)` — All cloud commands (KV, Vector, Storage, etc.)
- `Bash(agentuity auth whoami *)` — Auth status checks

**Blocked** (denied even if user approves):
- `Bash(agentuity cloud secrets *)` — Secret management
- `Bash(agentuity cloud secret *)` — Individual secret access
- `Bash(agentuity cloud apikey *)` — API key management
- `Bash(agentuity auth token *)` — Auth token access

The deny rules take precedence over allow rules (Claude Code evaluates deny first). A PreToolUse hook provides an additional safety layer by blocking sensitive commands before they reach the permission system.

To manually configure permissions, add to `~/.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": ["Bash(agentuity cloud *)", "Bash(agentuity auth whoami *)"],
    "deny": ["Bash(agentuity cloud secrets *)", "Bash(agentuity cloud secret *)", "Bash(agentuity cloud apikey *)", "Bash(agentuity auth token *)"]
  }
}
```

## Cadence: Long-Running Autonomous Sessions

Cadence enables the agent team to work autonomously on complex tasks across multiple iterations until completion. It uses a Stop hook (inspired by the [Ralph Wiggum technique](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)) to keep the loop running programmatically.

### How It Works

1. `/agentuity-cadence` creates a state file (`.claude/agentuity-cadence.local.md`) with the task prompt
2. Claude works on the task, delegating to Architect, Scout, Reviewer, etc.
3. When Claude tries to stop, `cadence-stop.sh` intercepts and:
   - Checks the transcript for `<promise>DONE</promise>` completion signal
   - If not done: blocks the stop, increments iteration, re-injects the prompt with Memory checkpoint instructions
   - If done or max iterations reached: allows the stop
4. Memory agent is triggered at each iteration for checkpoints

### Starting a Cadence Session

```
/agentuity-cadence implement the new payment integration with Stripe, including tests and docs
```

Options:
- `--max-iterations N` — Stop after N iterations (default: 50)
- `--completion-promise TEXT` — Custom completion signal (default: DONE)

### Cadence Control

| Action | How |
| --- | --- |
| Start | `/agentuity-cadence build the auth feature` |
| Start (limited) | `/agentuity-cadence --max-iterations 20 build the auth feature` |
| Cancel | `/agentuity-cadence-cancel` |
| Force stop | Ctrl+C |

### Recommended Agent for Cadence

**Architect** is the recommended agent for Cadence mode, optimized for:

- Long-running autonomous tasks
- Complex multi-file features
- Deep analysis before implementation
- Checkpoint-based progress tracking

For quick fixes during a Cadence session, Builder can still be used for minor iterations.

### Lead-of-Leads: Parallel Work Orchestration

For very large tasks with independent workstreams, Lead can spawn **child Leads** to work in parallel via the Task tool.

#### When to Use

| Signal | Example |
| --- | --- |
| **Independent workstreams** | "Build auth, payments, and notifications" — each is separate |
| **Explicit parallelism** | User says "do these in parallel" or "work on multiple fronts" |
| **Large scope, clear boundaries** | PRD has 3+ phases that don't depend on each other |

**Don't use Lead-of-Leads for:**

- Small tasks that one team can handle easily
- Large tasks with clear sequential order
- Work requiring tight coordination between parts

#### How It Works

```
User: "Build auth, cart, and payments in parallel"
           |
           v
    +-----------+
    | Parent Lead| <-- Orchestrates
    +-----------+
           |
           | 1. Ask Product to create PRD with workstreams
           v
    +-----------+
    |  Product  | <-- Creates PRD with 3 workstreams
    +-----------+
           |
           | 2. Spawn 3 child Leads via parallel Task tool calls
           v
    +-------+-------+-------+
    |Child 1|Child 2|Child 3| <-- Each claims a workstream
    | Auth  | Cart  |Payment|
    +-------+-------+-------+
           |
           | 3. Each child works autonomously, updates PRD when done
           v
    +-----------+
    | Parent Lead| <-- Does integration when all done
    +-----------+
```

#### Coordination Rules

- **PRD is source of truth** — All Leads read/update the same PRD
- **Product manages workstreams** — Child Leads ask Product to claim/complete workstreams
- **No direct child-to-child communication** — Coordinate through PRD only
- **Parent handles integration** — After children complete, parent does any glue work

## Differences from @agentuity/opencode

This plugin provides the same agent team as `@agentuity/opencode` but adapted for Claude Code's plugin architecture:

| OpenCode | Claude Code | Notes |
| --- | --- | --- |
| 9 agents | 7 agents | Runner, Expert, Reasoner absorbed into agents/skills |
| `@mention` delegation | Task tool delegation | `agentuity-coder:agentuity-coder-{role}` |
| `agentuity_background_task` | Parallel Task tool calls | Native Claude Code parallelism |
| `session.compacted` cadence | Stop hook cadence | Ralph Wiggum-style loop via `cadence-stop.sh` |
| Expert agent | 4 skills | Backend, Frontend, Ops, Cloud (auto-activated) |
| Runner agent | Command-runner skill | Inline in Builder/Architect |
| Reasoner agent | Reasoning skill | Inline in Memory |
| Monitor agent | Hooks | SessionStart/SessionEnd events |
| LSP tools | Glob/Grep | Claude Code native search |
| `opencode.json` config | Agent markdown frontmatter | Model/tool config per agent |

## Local Development

When developing the claude-code package locally within the SDK monorepo:

### Quick Start

```bash
# From the SDK monorepo root
cd packages/claude-code

# Build TypeScript (install script)
bun run build

# Load plugin in Claude Code for testing
claude --plugin-dir /path/to/sdk/packages/claude-code
```

### Validate Plugin Structure

```bash
claude plugin validate /path/to/sdk/packages/claude-code
```

This checks that the manifest, agents, skills, hooks, and commands are all properly structured.

### Development Workflow

1. Edit agent/skill/command/hook files in `packages/claude-code/`
2. If you changed `src/install.ts`, rebuild: `bun run build`
3. Restart Claude Code to pick up changes (or start a new session with `--plugin-dir`)
4. Test with `/agentuity-coder` or by invoking agents directly

### Project Structure

```
packages/claude-code/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── agents/                   # 7 agent definitions
│   ├── lead.md              # Orchestrator (opus)
│   ├── scout.md             # Read-only explorer (haiku)
│   ├── builder.md           # Code implementer (sonnet)
│   ├── architect.md         # Complex autonomous tasks (opus)
│   ├── reviewer.md          # Code reviewer (sonnet)
│   ├── memory.md            # Memory manager (haiku)
│   └── product.md           # Product strategy (sonnet)
├── skills/                   # 6 auto-activated skills
│   ├── agentuity-backend/
│   ├── agentuity-frontend/
│   ├── agentuity-ops/
│   ├── agentuity-cloud/
│   ├── command-runner/
│   └── reasoning/
├── commands/                 # 6 slash commands
│   ├── agentuity-coder.md          # /agentuity-coder
│   ├── agentuity-cadence.md        # /agentuity-cadence
│   ├── agentuity-cadence-cancel.md # /agentuity-cadence-cancel
│   ├── agentuity-memory-save.md    # /agentuity-memory-save
│   ├── agentuity-memory-share.md   # /agentuity-memory-share
│   └── agentuity-sandbox.md        # /agentuity-sandbox
├── hooks/                    # Event hooks
│   ├── hooks.json
│   └── scripts/
│       ├── block-sensitive-commands.sh # Blocks secrets/apikey/token access
│       ├── pre-compact.sh             # Memory save before compaction
│       ├── cadence-stop.sh            # Cadence loop continuation
│       ├── setup-cadence.sh           # Cadence state initialization
│       ├── stop-memory-save.sh        # Memory save before session stop
│       ├── session-start.sh           # Gathers project context
│       └── session-end.sh             # Dual-path memory save (KV + async)
├── src/
│   └── install.ts           # Install script
├── dist/                     # Built output
├── AGENTS.md                # Architecture documentation
├── package.json
└── tsconfig.json
```

### Reverting to Published Package

To revert from a local build to the published npm package:

```bash
agentuity ai claude-code install
```

### Running the SDK Monorepo Build

From the monorepo root:

```bash
# Install dependencies
bun install

# Build all packages (including claude-code)
bun run build

# Build just claude-code
cd packages/claude-code && bun run build
```

### Scripts

| Script | Command | Description |
| --- | --- | --- |
| build | `bun run build` | Compile TypeScript to `dist/` |
| typecheck | `bun run typecheck` | Type-check without emitting |
| clean | `bun run clean` | Remove `dist/` and build cache |
| test | `bun test` | Run tests |

## Recommended MCP Servers

For enhanced Scout and skill capabilities, add MCP servers to your Claude Code settings (`~/.claude/.mcp.json`):

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp"]
    }
  }
}
```

| MCP | Purpose |
| --- | --- |
| **context7** | Library documentation lookup |

## Resources

- SDK: https://github.com/agentuity/sdk
- Docs: https://agentuity.dev
- Claude Code: https://docs.anthropic.com/en/docs/claude-code
