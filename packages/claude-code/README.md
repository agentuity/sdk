# Agentuity Plugin for Claude Code

A [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins) for deploying websites, apps, and AI agents to [Agentuity](https://agentuity.dev) — with managed databases, storage, sandboxes, queues, and more.

When you ask Claude Code to deploy a website, build an agent, create a database, or set up any cloud service, relevant skills activate automatically and guide the process.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) installed
- [Agentuity CLI](https://agentuity.dev/get-started/installation) installed and authenticated (`agentuity auth login`)
- [Bun](https://bun.sh/) runtime

## Installation

```bash
# Via Claude Code marketplace
/install agentuity
```

## Skills

Skills activate automatically based on conversation context — no slash commands needed.

| Skill | Activates When | Covers |
|---|---|---|
| **agentuity-project** | Deploying, hosting, or creating projects | Project structure, migration patterns, `agentuity deploy` |
| **agentuity-cloud** | Working with cloud infrastructure | Platform services overview (DB, storage, queues, etc.) |
| **agentuity-backend** | Using Agentuity backend packages | `@agentuity/runtime`, `@agentuity/schema`, `@agentuity/drizzle`, etc. |
| **agentuity-frontend** | Using Agentuity frontend packages | `@agentuity/react`, `@agentuity/auth`, etc. |
| **agentuity-ops** | Running Agentuity CLI commands | CLI reference, cloud service management |

### Example Interactions

**Deploy an existing app:**
> "I want to deploy this Express app I built"
> → `agentuity-project` activates, guides restructuring for Agentuity, deploys with `agentuity deploy`

**Create a database:**
> "I need a database for my app"
> → `agentuity-cloud` activates with platform services, `agentuity-ops` provides CLI commands

**Build with the SDK:**
> "Create a React frontend that calls my agent"
> → `agentuity-frontend` activates with `@agentuity/react` hooks guidance

## Local Development

To test the plugin locally instead of the marketplace version:

```bash
# Run Claude Code with the local plugin
claude --plugin-dir /path/to/sdk/packages/claude-code

# Validate plugin structure
claude plugin validate /path/to/sdk/packages/claude-code

# Build (after changing src/install.ts)
bun run build
```

### Project Structure

```
packages/claude-code/
├── .claude-plugin/plugin.json   # Plugin manifest
├── hooks/                       # Session lifecycle hooks
│   ├── hooks.json               # Hook configuration
│   └── session-start.sh         # Detects Agentuity projects at session start
├── skills/                      # Auto-activated knowledge skills
│   ├── agentuity-project/       # Deployment, project structure, migration
│   ├── agentuity-cloud/         # Platform services overview
│   ├── agentuity-backend/       # Backend SDK reference
│   ├── agentuity-frontend/      # Frontend SDK reference
│   └── agentuity-ops/           # CLI and cloud operations
├── src/install.ts               # Install script (permissions setup)
├── AGENTS.md                    # Plugin overview (injected into sessions)
├── README.md
├── package.json
├── tsconfig.json
└── LICENSE
```

### Session Start Hook

When you open a project that has `agentuity.json`, the plugin automatically injects context telling Claude this is an Agentuity project — including the project name, region, and a reminder to use Agentuity for all infrastructure. This means Claude won't suggest other providers even in new sessions.

## License

Apache-2.0
