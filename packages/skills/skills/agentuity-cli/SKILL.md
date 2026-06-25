---
name: agentuity-cli
description: >-
  Use when working with the Agentuity CLI itself: installation, authentication,
  profiles, JSON output, command discovery, schema inspection, non-interactive
  automation, structured input, and deciding which Agentuity command family to
  use.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity CLI

The `agentuity` CLI manages project setup, local development, deploys, cloud
resources, auth, profiles, and agent-friendly command schemas. When unsure about
flags or response shapes, ask the CLI instead of guessing.

## First Checks

```bash
agentuity --version
agentuity auth whoami
agentuity --help
```

If the user is not authenticated:

```bash
agentuity auth login
```

Headless environments should use documented API-key environment variables or a
configured profile. A first-class API-key login flow is tracked as an SDK issue;
do not invent unsupported auth commands.

## Command Discovery

Use these before guessing flags:

```bash
agentuity <command> --help
agentuity --help json
agentuity ai schema show
agentuity ai capabilities show
agentuity ai intro
```

Per-command schema:

```bash
agentuity cloud deployment logs --describe
agentuity project import --describe
```

The CLI schema is useful for agentic tools because commands declare arguments, options, tags, and response shapes.

## JSON and Structured Input

Use `--json` for machine-readable output:

```bash
agentuity --json project show
agentuity --json cloud deployment list
agentuity --json cloud session list --success=false --count=25
```

Use `--fields` to reduce output:

```bash
agentuity --json --fields id,name,region project list
```

Use `--input` when building commands programmatically:

```bash
agentuity --input '{"name":"my-app","framework":"nextjs","confirm":true}' project create
```

Use `--validate` with `--input` to check shape without executing when the command supports validation:

```bash
agentuity --validate --input '{"name":"my-app"}' project import
```

## Command Families

| Need | Command family | Skill |
|---|---|---|
| Create/import/run/build/deploy an app | `project`, `dev`, `build`, `deploy` | `agentuity-project` |
| Manage deployments, logs, env, resources, SSH | `cloud` | `agentuity-cloud` |
| Use service clients from app code | package installs | `agentuity-services` |
| Build model-backed features | AI Gateway and provider SDK commands | `agentuity-ai` |
| Add relational data | `cloud db`, `project add database` | `agentuity-database` |
| Add async work | `cloud queue`, `cloud schedule`, `cloud webhook`, `cloud task` | `agentuity-background-work` |
| Manage cloud coding sessions | `coder` | Agentuity Coder docs |

## Auth and Profiles

Useful auth commands:

```bash
agentuity auth login
agentuity auth logout
agentuity auth whoami
agentuity auth org select
agentuity auth ssh add --file ~/.ssh/id_rsa.pub
```

Profiles let users switch account, org, and region context:

```bash
agentuity profile list
agentuity profile use <name>
```

If profile commands do not appear in normal help, use the docs and
`agentuity ai schema show` to inspect current support. Profile discoverability is
tracked as an SDK issue under the `agentic flow` label.

## Non-Interactive Automation

For CI and autonomous agents:

```bash
agentuity --json project show
agentuity project import --name my-app --org-id <org-id> --confirm
agentuity deploy --json --message "Automated deploy"
```

Prefer explicit context:

| Context | Prefer |
|---|---|
| Project | run from the app directory or pass `--dir` / `--project-id` |
| Organization | pass `--org-id` or select it in auth/profile setup |
| Region | pass `--region` or select one before automation |
| Destructive commands | pass `--force` or `--confirm` when supported |

The CLI has strong JSON support, but a few command gaps remain. Use bounded
polling and explicit timeouts when waiting for deployments or logs.

## Error Handling

Use JSON error output in scripts:

```bash
agentuity --json --error-format json project show
```

If a command fails:

1. Re-run with `--help` to verify flags.
2. Re-run with `--describe` to inspect schema.
3. Add `--json` for structured output.
4. Add explicit `--project-id`, `--org-id`, and `--region` if context resolution failed.
5. For deploy/debug flows, switch to `agentuity-cloud`.

## Common Mistakes

| Mistake | Better approach |
|---|---|
| Guessing CLI flags from memory | Run `agentuity <command> --help` or `--describe` |
| Parsing human tables in automation | Use `--json` and `--fields` |
| Relying on implicit org/region in CI | Pass `--org-id`, `--region`, and project context explicitly |
| Assuming every prompt is safe in non-TTY | Use explicit confirm/force flags where available |
| Teaching unsupported commands | Verify with help or schema output first |

## Useful Docs

- CLI reference: https://agentuity.dev/reference/cli
- Getting started: https://agentuity.dev/reference/cli/getting-started
- Profiles: https://agentuity.dev/reference/cli/profiles
- Deployment: https://agentuity.dev/reference/cli/deployment
- Debugging: https://agentuity.dev/reference/cli/debugging
- AI commands: https://agentuity.dev/reference/cli/ai-commands
