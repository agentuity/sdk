# Agentuity Agent Skills

A collection of [Agent Skills](https://agentskills.io/) for AI coding agents working with the Agentuity SDK.

Canonical skill source lives in `packages/skills/skills/`. This root `skills/` directory is synced from the npm package so Git-based installs keep working.

## Available Skills

| Skill | Use when |
|-------|----------|
| **agentuity-project** | Creating, importing, running, building, or deploying Agentuity apps |
| **agentuity-frameworks** | Choosing framework-native route, page, server function, and config locations |
| **agentuity-ai** | Building model-backed features, structured output, streaming, tools, or memory |
| **agentuity-services** | Using Agentuity service clients from server-side app code |
| **agentuity-database** | Adding relational data with managed Postgres and app-owned database clients |
| **agentuity-background-work** | Adding queues, schedules, webhooks, tasks, durable output, or status handles |
| **agentuity-cloud** | Managing deployments, logs, env, regions, resources, SSH, or debugging through the CLI |
| **agentuity-cli** | Using CLI auth, profiles, JSON, schemas, structured input, and command discovery |

## Installation

```bash
# Install all skills
npx skills add agentuity/sdk

# Install a specific skill
npx skills add agentuity/sdk --skill agentuity-ai

# Install to a specific agent
npx skills add agentuity/sdk -a claude-code
npx skills add agentuity/sdk -a pi
npx skills add agentuity/sdk -a cursor
```

## Skill Format

Each skill follows the [Agent Skills specification](https://agentskills.io/specification):

```
skills/
├── agentuity-project/
│   └── SKILL.md
├── agentuity-frameworks/
│   └── SKILL.md
├── agentuity-ai/
│   └── SKILL.md
├── agentuity-services/
│   └── SKILL.md
├── agentuity-database/
│   └── SKILL.md
├── agentuity-background-work/
│   └── SKILL.md
├── agentuity-cloud/
│   └── SKILL.md
└── agentuity-cli/
	 └── SKILL.md
```

## License

Apache-2.0
