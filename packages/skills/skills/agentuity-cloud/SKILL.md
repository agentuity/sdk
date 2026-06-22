---
name: agentuity-cloud
description: >-
  Use when managing Agentuity Cloud from the terminal. Covers deployments,
  deployment logs, environment variables and secrets, regions, project resource
  linking, cloud resource commands, SSH, SCP, monitoring snapshots, and
  agent-friendly CLI workarounds.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Cloud Operations

Use this skill when operating Agentuity from the CLI: deployments, logs,
environment values, resources, SSH access, and live debugging. Use
`agentuity-services` or `agentuity-database` for app-code client usage.

## Deployment Lifecycle

Deploy from a linked project:

```bash
agentuity deploy
```

List recent deployments:

```bash
agentuity cloud deployment list
agentuity cloud deployment list --count=25
agentuity cloud deployment list --project-id=proj_abc123xyz
```

Show one deployment:

```bash
agentuity cloud deployment show deploy_abc123xyz
agentuity cloud deployment show deploy_abc123xyz --project-id=proj_abc123xyz
```

View deployment logs:

```bash
agentuity cloud deployment logs deploy_abc123xyz
agentuity cloud deployment logs deploy_abc123xyz --limit=50
agentuity cloud deployment logs deploy_abc123xyz --no-timestamps
agentuity cloud deployment logs deploy_abc123xyz --project-id=proj_abc123xyz
```

Deployment logs are currently a snapshot command, not a follow stream. If an
agent needs to wait for new log output, poll with a bounded loop and stop when
the deploy reaches a terminal state or enough evidence is collected.

Rollback, undeploy, and delete:

```bash
agentuity cloud deployment rollback
agentuity cloud deployment undeploy --force
agentuity cloud deployment delete deploy_abc123xyz --force
```

Use destructive commands carefully. Prefer explicit `--force` or `--confirm`
flags in automation when a command supports them.

## Environment Variables and Secrets

List and inspect project values:

```bash
agentuity cloud env list
agentuity cloud env get NODE_ENV
agentuity cloud env list --secrets
```

Set values:

```bash
agentuity cloud env set NODE_ENV production
agentuity cloud env set API_KEY "sk_live_..." --secret
```

Sync `.env`:

```bash
agentuity cloud env push
agentuity cloud env pull
agentuity cloud env pull --force
agentuity cloud env import .env.staging
```

There is no separate secret namespace command. Secrets are managed through `agentuity cloud env` with `--secret`.

## Regions and Project Context

Use explicit project and region options in non-interactive automation:

```bash
agentuity cloud region list
agentuity cloud region current
agentuity cloud region select usc
agentuity project show --json
```

Project resolution usually comes from `agentuity.json` in the app directory. In
monorepos, run commands from the app package or pass `--dir`.

## Resource Management

Use cloud commands to create, inspect, and manage resources. Use `--json` when an agent needs to parse output.

| Resource | Commands to start with |
|---|---|
| Key-value | `agentuity cloud kv list-namespaces`, `get`, `set`, `keys`, `stats` |
| Vector | `agentuity cloud vector list`, `upsert`, `search`, `get`, `delete` |
| Object storage | `agentuity cloud storage create`, `list`, `upload`, `download` |
| Database | `agentuity cloud db create`, `list`, `get --show-credentials`, `logs` |
| Queues | `agentuity cloud queue create`, `publish`, `receive`, `destinations` |
| Sandboxes | `agentuity cloud sandbox create`, `exec`, `files`, `cp`, `snapshot` |
| Email | `agentuity cloud email create`, `send`, `list`, `stats` |
| Schedules | `agentuity cloud schedule create`, `list`, `get`, `delete` |
| Tasks | `agentuity cloud task list`, `get`, `create`, `update` |
| Webhooks | `agentuity cloud webhook create`, `list`, `get`, `delete` |
| Streams | `agentuity cloud stream create`, `list`, `get`, `delete` |
| AI Gateway | `agentuity cloud aigateway models --recommended`, `--ids`, `--provider` |

Link resources to the current project when app code needs local `.env` values:

```bash
agentuity project add database app_data
agentuity project add storage my-bucket
```

Check `agentuity project add --help` for the supported resource types in the installed CLI.

## SSH and File Transfer

Add an SSH key first:

```bash
agentuity auth ssh add --file ~/.ssh/id_rsa.pub
```

Connect:

```bash
agentuity cloud ssh
agentuity cloud ssh proj_abc123xyz
agentuity cloud ssh deploy_abc123xyz
agentuity cloud ssh 'ps aux'
agentuity cloud ssh --show
```

Transfer files:

```bash
agentuity cloud scp upload ./config.json /app/config.json
agentuity cloud scp download /var/log/app.log ./logs/
```

SSH is for debugging. Do not treat manual container changes as deployable source-of-truth changes.

## Monitoring and Debugging

Use snapshot output for automation:

```bash
agentuity cloud monitor --json
agentuity cloud monitor --snapshot
agentuity cloud monitor --deployment deploy_abc123xyz --snapshot
```

Inspect sessions when debugging request-specific behavior:

```bash
agentuity cloud session list --count=25
agentuity cloud session list --success=false --count=25
agentuity cloud session get sess_abc123xyz
agentuity cloud session logs sess_abc123xyz --no-timestamps
```

## Agent-Friendly Workflow

For deploy-debug loops:

1. Run `agentuity deploy --json` when machine-readable output is needed.
2. Capture the deployment ID from output.
3. Run `agentuity cloud deployment show <id> --json`.
4. Inspect recent logs with `agentuity cloud deployment logs <id> --limit=100`.
5. Use `agentuity cloud monitor --deployment <id> --snapshot` for machine health.
6. Use SSH only after logs and structured status point to runtime-only evidence.

Known CLI gaps are tracked under the `agentic flow` GitHub label. Until
wait/follow/status primitives exist, use bounded polling and explicit timeouts
in automation.

## Common Mistakes

| Mistake | Better approach |
|---|---|
| Guessing URLs after deploy | Read deploy output or `cloud deployment show` |
| Expecting deployment logs to follow live | Poll with a limit until follow support exists |
| Managing secrets with a separate command | Use `cloud env set --secret` |
| Running destructive commands without explicit confirmation flags | Use `--force` or `--confirm` when supported |
| Editing a debug container and calling it deployed | Commit the source change and redeploy |

## Useful Docs

- Deployment: https://agentuity.dev/reference/cli/deployment
- Debugging: https://agentuity.dev/reference/cli/debugging
- Configuration: https://agentuity.dev/reference/cli/configuration
- Monitoring: https://agentuity.dev/reference/cli/monitoring
- Storage commands: https://agentuity.dev/reference/cli/storage
