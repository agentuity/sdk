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
agentuity skills setup
```

New Agentuity projects scaffold with skills wiring enabled by default.

## Release Blocker

Do not release this npm skills rollout until the SDK `agentic flow` CLI gap issues are resolved or explicitly waived: [#1575](https://github.com/agentuity/sdk/issues/1575), [#1576](https://github.com/agentuity/sdk/issues/1576), [#1577](https://github.com/agentuity/sdk/issues/1577), [#1578](https://github.com/agentuity/sdk/issues/1578), [#1579](https://github.com/agentuity/sdk/issues/1579), [#1580](https://github.com/agentuity/sdk/issues/1580), and [#1581](https://github.com/agentuity/sdk/issues/1581). See the [`agentic flow` label](https://github.com/agentuity/sdk/issues?q=label%3A%22agentic+flow%22) for the full blocker set.

## Install (Git registry)

```bash
npx skills add agentuity/sdk
npx skills add agentuity/sdk --skill agentuity-ai
npx skills add agentuity/sdk -a cursor
```

The repo-root [`skills/`](../../skills/) directory is synced from this package on release.

## Claude Code plugin

Deployment-opinionated skills for Claude Code ship separately in `@agentuity/claude-code` — not in this package.

## License

Apache-2.0
