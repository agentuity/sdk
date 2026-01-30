# @agentuity/opencode

An Open Code plugin providing a team of specialized AI agents with access to Agentuity cloud services and SDK expertise.

## Installation

```bash
agentuity ai opencode install
```

## Usage

In Open Code, use slash commands or `@mention` agents directly:

```
/agentuity-coder implement dark mode for settings page
/agentuity-cloud list all my KV namespaces
/agentuity-sandbox run bun test in a sandbox
```

## Commands

| Command                  | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `/agentuity-coder`       | Run tasks with the full agent team (Lead orchestrates) |
| `/agentuity-cadence`     | 🔄 Start a long-running autonomous loop                |
| `/agentuity-cloud`       | ☁️ Interact with any Agentuity cloud service           |
| `/agentuity-sandbox`     | 🏖️ Run code in isolated sandbox environments           |
| `/agentuity-memory-save` | Save session context to memory                         |

### Cloud Services via `/agentuity-cloud`

The Expert agent can operate any `agentuity cloud` subcommand:

| Service         | CLI                          | Examples                           |
| --------------- | ---------------------------- | ---------------------------------- |
| **KV**          | `agentuity cloud kv`         | `list namespaces`, `set key value` |
| **Storage**     | `agentuity cloud storage`    | `upload file`, `list buckets`      |
| **Vector**      | `agentuity cloud vector`     | `search for auth patterns`         |
| **Sandbox**     | `agentuity cloud sandbox`    | `run tests`, `create environment`  |
| **Database**    | `agentuity cloud db`         | `create table`, `run SQL`          |
| **SSH**         | `agentuity cloud ssh`        | `connect to deployment`            |
| **Deployments** | `agentuity cloud deployment` | `list`, `inspect`                  |
| **Agents**      | `agentuity cloud agent`      | `list`, `inspect`                  |
| **Sessions**    | `agentuity cloud session`    | `list`, `inspect`                  |
| **Threads**     | `agentuity cloud thread`     | `list`, `inspect`                  |

## Agent Team

| Agent          | Role                   | When to Use                                                         |
| -------------- | ---------------------- | ------------------------------------------------------------------- |
| **Lead**       | Orchestrator           | Automatically coordinates all work                                  |
| **Scout**      | Explorer               | Finding files, patterns, codebase analysis (read-only)              |
| **Builder**    | Implementer            | Interactive code changes, quick fixes, guided implementation        |
| **Sr Builder** | Autonomous Implementer | Cadence mode, complex multi-file features, long-running tasks       |
| **Reviewer**   | Code Reviewer          | Reviewing changes, catching issues, suggesting fixes                |
| **Memory**     | Context Manager        | Storing/retrieving context, decisions, patterns across sessions     |
| **Expert**     | Agentuity Specialist   | CLI commands, cloud services, SDK questions                         |
| **Planner**    | Strategic Advisor      | Complex architecture decisions, deep technical planning (read-only) |

### Builder vs Sr Builder

| Aspect        | Builder                  | Sr Builder                     |
| ------------- | ------------------------ | ------------------------------ |
| **Mode**      | Interactive              | Autonomous                     |
| **Best for**  | Quick fixes, guided work | Cadence mode, complex features |
| **Model**     | Claude Opus 4.5          | GPT 5.2 Codex                  |
| **Reasoning** | High                     | Maximum (xhigh)                |
| **Context**   | Session-based            | Checkpoint-based               |

**Use Builder when:** You're working interactively, making quick changes, or need guidance.

**Use Sr Builder when:** Running Cadence mode, implementing complex multi-file features, or need autonomous execution with deep reasoning.

## Model Configuration

Each agent has a default model optimized for its role:

| Agent      | Default Model                          | Reasoning Level         |
| ---------- | -------------------------------------- | ----------------------- |
| Lead       | `anthropic/claude-opus-4-5-20251101`   | max (extended thinking) |
| Scout      | `anthropic/claude-haiku-4-5-20251001`  | -                       |
| Builder    | `anthropic/claude-opus-4-5-20251101`   | high                    |
| Sr Builder | `openai/gpt-5.2-codex`                 | xhigh                   |
| Reviewer   | `anthropic/claude-sonnet-4-5-20250929` | high                    |
| Memory     | `anthropic/claude-haiku-4-5-20251001`  | -                       |
| Expert     | `anthropic/claude-sonnet-4-5-20250929` | high                    |
| Planner    | `openai/gpt-5.2`                       | xhigh                   |

### Overriding Agent Models

You can override any agent's model via `opencode.json`:

```json
{
	"agent": {
		"Agentuity Coder Builder": {
			"model": "anthropic/claude-sonnet-4-5-20250514"
		},
		"Agentuity Coder Sr Builder": {
			"model": "openai/gpt-5.2-codex",
			"reasoningEffort": "xhigh"
		}
	}
}
```

Run `opencode models` to see all available models.

### Configuration Options

**For OpenAI models:**

- `reasoningEffort`: `"low"` | `"medium"` | `"high"` | `"xhigh"` — controls reasoning depth

**For Anthropic models:**

- `variant`: `"low"` | `"medium"` | `"high"` | `"max"` — controls extended thinking level
- `thinking`: `{ "type": "enabled", "budgetTokens": 10000 }` — explicit thinking config

**General:**

- `model`: The model identifier (e.g., `"anthropic/claude-sonnet-4-5-20250514"`)
- `temperature`: Number between 0-1 (lower = more deterministic)
- `maxSteps`: Maximum tool use steps per turn

## Security

Sensitive CLI commands are blocked by default:

- `agentuity cloud secrets` / `secret`
- `agentuity cloud apikey`
- `agentuity auth token`

Configure in your Agentuity profile under `coder.blockedCommands`.

## Recommended MCP Servers

Add to your `opencode.json` for enhanced Scout/Expert capabilities:

```jsonc
{
	"mcp": {
		"context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" },
		"grep_app": { "type": "remote", "url": "https://mcp.grep.app" },
	},
}
```

| MCP          | Purpose             | Free Tier     |
| ------------ | ------------------- | ------------- |
| **context7** | Library docs lookup | 500 req/month |
| **grep_app** | GitHub code search  | Unlimited     |

## Cadence: Long-Running Autonomous Sessions

Cadence enables the agent team to work autonomously on complex tasks across multiple iterations until completion.

### Recommended Agent for Cadence

**Sr Builder** is the recommended agent for Cadence mode. It uses GPT 5.2 Codex with maximum reasoning effort (`xhigh`), optimized for:

- Long-running autonomous tasks
- Complex multi-file features
- Deep analysis before implementation
- Checkpoint-based progress tracking

For quick fixes during a Cadence session, Builder can still be used for minor iterations.

### Starting a Cadence Loop

```
/agentuity-cadence implement the new payment integration with Stripe, including tests and docs
```

Lead will:

1. Create loop state in KV storage (`agentuity-opencode-tasks`)
2. Work iteratively — delegating to Scout, Builder, Reviewer
3. Store checkpoints with Memory after each iteration
4. Output `<promise>DONE</promise>` when complete

### Cadence Control

Start with `/agentuity-cadence`, then use natural language:

| Action | How                                         |
| ------ | ------------------------------------------- |
| Start  | `/agentuity-cadence build the auth feature` |
| Status | "what's the status?"                        |
| Pause  | "pause"                                     |
| Resume | "continue"                                  |
| Extend | "continue for 50 more iterations"           |
| Stop   | "stop" or Ctrl+C                            |

### CLI Control (Headless)

For running Cadence in sandboxes or background:

```bash
# Start headless
agentuity ai opencode run "/agentuity-cadence build the auth feature"

# Monitor
agentuity ai cadence list
agentuity ai cadence status lp_auth_01

# Control
agentuity ai cadence pause lp_auth_01
agentuity ai cadence resume lp_auth_01
agentuity ai cadence stop lp_auth_01
```

### How It Works

Cadence is **agentic-first** — Lead's prompt drives the loop, not deterministic code. Lead:

- Manages its own state in KV
- Decides when to delegate and to whom
- Stores checkpoints via Memory for context management
- Continues until the task is truly complete

See [docs/cadence.md](docs/cadence.md) for architecture details.

## Local Development

When developing the opencode package locally, configure OpenCode to use your local build.

Edit `~/.config/opencode/opencode.json` to point to your local package:

```jsonc
{
	"$schema": "https://opencode.ai/config.json",
	"plugin": ["/path/to/agentuity/sdk/packages/opencode"],
}
```

Then build and restart OpenCode:

```bash
cd packages/opencode
bun run build
```

To revert to the published npm package, run `agentuity ai opencode install` to reset the plugin path to `@agentuity/opencode`.

## Resources

- SDK: https://github.com/agentuity/sdk
- Docs: https://agentuity.dev/
