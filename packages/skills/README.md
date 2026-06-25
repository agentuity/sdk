# @agentuity/skills

Official [Agent Skills](https://agentskills.io/) for AI coding agents working with the Agentuity SDK.

Skills ship inside this npm package under `skills/` and are discovered by [skills-npm](https://github.com/antfu/skills-npm) when installed as a project dependency.

## Skills

| Skill | Description |
|-------|-------------|
| **agentuity-project** | Create, import, run, build, and deploy framework apps |
| **agentuity-frameworks** | Put routes, pages, server functions, config, and service clients in framework-native files |
| **agentuity-ai** | Build model-backed features with AI Gateway, structured output, streaming, tools, and app-owned state |
| **agentuity-services** | Choose and use Agentuity service clients from server-side app code |
| **agentuity-database** | Use Agentuity-managed Postgres through `DATABASE_URL`, `pg`, Drizzle, or trusted admin scripts |
| **agentuity-background-work** | Add queues, schedules, webhooks, tasks, durable output, and status handles |
| **agentuity-cloud** | Manage deployments, logs, env, regions, resources, SSH, and debugging through the CLI |
| **agentuity-cli** | Use CLI auth, profiles, JSON, schemas, structured input, and command discovery |

## Install (npm)

```bash
npm i -D @agentuity/skills skills-npm
npx skills-npm setup
```

Or use the Agentuity CLI in an existing project:

```bash
agentuity skills install
```

New Agentuity projects scaffold with skills wiring enabled by default.

## Install (Git registry)

```bash
npx skills add agentuity/sdk/skills
npx skills add agentuity/sdk/skills --skill agentuity-ai
npx skills add agentuity/sdk/skills -a cursor
```

The repo-root [`skills/`](../../skills/) directory is synced from this package on release.

## Claude Code plugin

Deployment-opinionated skills for Claude Code ship separately in `@agentuity/claude-code` — not in this package.

## License

Apache-2.0
