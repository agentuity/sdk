---
name: agentuity-ops
description: When running Agentuity CLI commands for deploying, managing databases, creating sandboxes, configuring storage, queues, cron jobs, email, or any cloud resource. Also activates for SSH debugging, environment variables, and non-interactive automation.
version: 2.0.0
---

# Agentuity CLI & Operations Reference

## CLI Accuracy Contract (NON-NEGOTIABLE)

- **Never guess** flags, subcommands, or argument order
- If not 100% certain, FIRST run: `agentuity <cmd> --help`
- **Trust CLI output over memory** — never fabricate URLs or outputs
- For the full CLI schema: `agentuity ai schema show`

## Key Conventions

- Agentuity projects **always use `bun`** (never npm/pnpm) — check for `agentuity.json` or `.agentuity/`
- Check region config before adding `--region` flags (`~/.config/agentuity/config.json` and `agentuity.json`)
- Sandbox default working directory is `/home/agentuity` (not `/app`)
- Always read actual command output for URLs — never fabricate them

## Non-Interactive Execution

When running CLI commands programmatically (in Claude Code, CI, or scripts), skip confirmation prompts:

| Flag | Short | Behavior |
| --- | --- | --- |
| `--confirm` | — | Skip confirmation prompts |
| `--yes` | `-y` | Alias for `--confirm` |
| `--force` | — | Alias for `--confirm` (when command doesn't have its own `--force`) |

These work on any command with a confirmation prompt (deploy, create, delete, etc.).

**Special cases:**
- `agentuity project import` — requires BOTH `--name` and `--yes` for non-interactive use
- `agentuity cloud env push` — has its own `--force` flag (overwrites remote values); `--force` does NOT alias `--confirm` here
- `agentuity cloud deployment remove/undeploy` — has its own `--force` flag for the same reason

## Golden Commands

| Purpose          | Command                          |
| ---------------- | -------------------------------- |
| Create project   | `agentuity create`               |
| Start dev server | `agentuity dev` or `bun run dev` |
| Deploy           | `agentuity deploy`               |
| Check auth       | `agentuity auth whoami`          |
| List regions     | `agentuity region list`          |
| Get help         | `agentuity <command> --help`     |
| Full CLI schema  | `agentuity ai schema show`       |
| Migrate to v2    | `npx @agentuity/migrate`         |

## Cloud Services

| Service        | CLI Prefix                 | Documentation                                        |
| -------------- | -------------------------- | ---------------------------------------------------- |
| KV Storage     | `agentuity cloud kv`      | https://agentuity.dev/reference/cli/storage.md       |
| Vector Search  | `agentuity cloud vector`  | https://agentuity.dev/reference/cli/storage.md       |
| Object Storage | `agentuity cloud storage` | https://agentuity.dev/reference/cli/storage.md       |
| Sandbox        | `agentuity cloud sandbox` | https://agentuity.dev/reference/cli/sandbox.md       |
| Database       | `agentuity cloud db`      | https://agentuity.dev/services/database.md           |
| SSH            | `agentuity cloud ssh`     | https://agentuity.dev/reference/cli/debugging.md     |
| Deployments    | `agentuity deploy`        | https://agentuity.dev/reference/cli/deployment.md    |

## Documentation Links

| Topic              | Link                                                     |
| ------------------ | -------------------------------------------------------- |
| CLI Getting Started | https://agentuity.dev/reference/cli/getting-started.md  |
| Build Configuration | https://agentuity.dev/reference/cli/build-configuration.md |
| Deployment         | https://agentuity.dev/reference/cli/deployment.md        |
| Local Development  | https://agentuity.dev/reference/cli/development.md       |
| Debugging          | https://agentuity.dev/reference/cli/debugging.md         |
| Storage Commands   | https://agentuity.dev/reference/cli/storage.md           |
| Sandbox Commands   | https://agentuity.dev/reference/cli/sandbox.md           |
| Configuration      | https://agentuity.dev/reference/cli/configuration.md     |
| Git Integration    | https://agentuity.dev/reference/cli/git-integration.md   |
| GitHub App         | https://agentuity.dev/reference/github-app.md            |
| Migration Guide    | https://agentuity.dev/reference/migration-guide.md       |

## Common Mistakes

| Mistake                            | Better Approach       | Why                                  |
| ---------------------------------- | --------------------- | ------------------------------------ |
| Blindly adding `--region` flag     | Check config first    | Region may already be configured     |
| Using npm for Agentuity projects   | Always use `bun`      | Agentuity is Bun-native              |
| Hardcoding sandbox paths as `/app` | Use `/home/agentuity` | That's the default working directory |
| Making up CLI flags                | Run `--help` first    | Flags change between versions        |
| Fabricating deployment URLs        | Read actual output    | URLs are generated dynamically       |
| Using `expect`/`yes |` for prompts | Use `--yes` or `--force` flag | Built-in flag support is cleaner and more reliable |
| Running v1 project without migrating | Run `npx @agentuity/migrate` first | v2 requires explicit agent/router wiring |

## When In Doubt, Check the Docs

If you're unsure about any CLI command, flag, or service, **check first** rather than guessing:

- Run `agentuity <command> --help` for flag details
- Full CLI schema: `agentuity ai schema show`
- Full docs: https://agentuity.dev
- LLM-friendly index: https://agentuity.dev/llms.txt
