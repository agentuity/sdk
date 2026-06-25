<div align="center">
    <img src=".github/GitHub.png" alt="Agentuity" width="1420"/> <br/>
<br />
<a href="https://npm.im/@agentuity/cli"><img alt="NPM version" src="https://img.shields.io/npm/v/%40agentuity%2Fcli.svg"></a>
<a href="https://github.com/agentuity/sdk/blob/main/README.md"><img alt="License" src="https://badgen.now.sh/badge/license/Apache-2.0"></a>
<a href="https://discord.gg/vtn3hgUfuc"><img alt="Join the community on Discord" src="https://img.shields.io/discord/1332974865371758646.svg?style=flat"></a>
</div>
<br />

# Getting Started

The fastest way to install and get started is to install the CLI:

```bash
curl -fsSL https://agentuity.sh | sh
```

<div align="center">
  <a href="https://www.youtube.com/watch?v=hOhMqY2T7so">
    <img src="https://img.youtube.com/vi/hOhMqY2T7so/maxresdefault.jpg"
         alt="Get Started with Agentuity"
         width="640" height="360">
  </a>
</div>

<p>&nbsp;</p>

Visit [https://agentuity.com/](https://agentuity.com/) to learn more about Agentuity and create a free account or sign up in the CLI after installation.

# Agent Skills

This repository includes [Agent Skills](https://agentskills.io/) that teach AI coding agents how to work with the Agentuity SDK. Install them with:

```bash
npx skills add agentuity/sdk/skills
```

Available skills:

| Skill | Description |
|-------|-------------|
| **agentuity-project** | Create, import, run, build, and deploy framework apps |
| **agentuity-frameworks** | Use framework-native route, page, server function, and config locations |
| **agentuity-ai** | Build model-backed features with AI Gateway, structured output, streaming, tools, and app-owned state |
| **agentuity-services** | Choose and use Agentuity service clients from server-side app code |
| **agentuity-database** | Add relational data with managed Postgres and app-owned database clients |
| **agentuity-background-work** | Add queues, schedules, webhooks, tasks, durable output, and status handles |
| **agentuity-cloud** | Manage deployments, logs, env, regions, resources, SSH, and debugging through the CLI |
| **agentuity-cli** | Use CLI auth, profiles, JSON, schemas, structured input, and command discovery |

See [`skills/README.md`](./skills/README.md) for details.

# Documentation

Visit [https://agentuity.dev](https://agentuity.dev/) to view the full documentation.

# Community

The Agentuity community can be found on [GitHub Discussions](https://github.com/agentuity/sdk/discussions) where you can discuss ideas, give feedback and share your projects with others.

To chat with other community members you can join the [Agentuity Discord server](https://discord.gg/agentuity).

# Development

## Structure

The structure of this mono repository:

### Tooling

- `packages/cli` — the Agentuity command line tool
- `packages/create-agentuity` — `bun create agentuity` shim that delegates to the CLI
- `packages/coder`, `packages/coder-tui` — Agentuity Coder Hub (sandbox-as-a-service IDE)
- `packages/vscode` — VS Code extension for Agentuity
- `packages/claude-code` — Claude Code plugin with multi-agent coding team
- `packages/opencode` — Opencode agent plugins for Agentuity

### Service clients (use these directly in your apps)

- `packages/db` — Database service client (Postgres via the Catalyst API)
- `packages/email` — Email service client
- `packages/keyvalue` — Key-value storage
- `packages/queue` — Message queues
- `packages/sandbox` — Code execution sandboxes
- `packages/schedule` — Cron-based scheduled tasks
- `packages/storage` — S3-compatible object storage
- `packages/task` — Task management (tasks, comments, attachments)
- `packages/vector` — Vector search
- `packages/webhook` — Webhook destinations

### Framework integration

- `packages/hono` — Hono middleware for Agentuity service injection
- `packages/migrate` — v1→v2 and v2→v3 migration tooling

### Internal

- `packages/core` — Shared utilities, types, and the underlying API client
- `packages/server` — Server-side helpers (config, logging, validators) used by `@agentuity/cli`
- `packages/telemetry` — OpenTelemetry initialization and JSONL exporters
- `packages/analytics` — Analytics primitives
- `packages/stream` — Streaming primitives
- `packages/adapter` — Fetch adapter helpers
- `packages/test-utils` — Internal test utilities (private, never published)

### Deprecated

- `packages/runtime` — v2 runtime, gutted to a deprecation stub for npm
- `packages/postgres`, `packages/drizzle` — superseded by using `drizzle-orm` + `@neondatabase/serverless` directly
- `packages/schema` — superseded by Zod / Valibot

Each package is its own published npm package but all packages are versioned and published together.

## Setup

```bash
bun install
```

## Build

```bash
bun run build
```

## Testing

Run the following to do a cycle of `lint`, `typecheck`, `format` and `test`:

```bash
bun all
```

For development workflow verification, ensure all commands run successfully before creating a PR.

## Linking to External Projects

To use the SDK in development mode with an existing project outside this repo:

```bash
./scripts/link-local.sh /path/to/your/project
```

This script builds all packages, creates tarballs, and installs them in your target project. After linking, run `bun run build` or `bun run dev` in your project to rebuild with the local SDK changes.

# LICENSE

See the [LICENSE](./LICENSE.md) for more information about the license to this project. The code is licensed under the Apache-2 License.

