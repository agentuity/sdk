---
name: agentuity-cli
description: Using the Agentuity CLI for project management, development, deployment, and cloud services. Use when scaffolding new projects with agentuity new, running dev servers, building and deploying, managing environment variables, working with cloud resources (KV, Vector, Storage, Sandbox, Database, Queue, Email), SSH access, or any agentuity CLI command. Triggers on Agentuity project setup, deployment, or cloud infrastructure tasks.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity CLI

The `agentuity` CLI manages your entire project lifecycle — from scaffolding to deployment — and provides direct access to cloud services.

## CLI Accuracy

**Never guess CLI flags or subcommands.** If uncertain about a command, run `agentuity <cmd> --help` first. Trust CLI output over memory. For the full command schema: `agentuity ai schema show`.

## Project Lifecycle

### Create a Project

```bash
agentuity new                        # Interactive setup
agentuity new --name my-project      # Named project
```

This scaffolds a complete project with agents, routes, and configuration.

### Development

```bash
bun run dev                          # Start dev server with hot reload
```

Read the terminal output for the actual URL — don't assume `localhost:3000`.

### Build and Deploy

```bash
bun run build                        # Build for production
agentuity deploy                     # Deploy to Agentuity Cloud
agentuity deploy --env production    # Deploy to specific environment
```

### Project Configuration

**`agentuity.json`** — project identity:

```json
{
  "projectId": "proj_abc123",
  "orgId": "org_xyz",
  "region": "use"
}
```

**`agentuity.config.ts`** — build configuration:

```typescript
import { defineConfig } from '@agentuity/runtime';

export default defineConfig({
  // Build options
});
```

## Important: Always Use Bun

If `agentuity.json` or `.agentuity/` exists, the project is Bun-only. Never suggest `npm` or `pnpm`.

## Authentication

```bash
agentuity auth login                 # Log in
agentuity auth logout                # Log out
agentuity auth whoami                # Check current user
agentuity auth signup                # Create account
```

## Environment Variables

```bash
agentuity cloud env list             # List env vars
agentuity cloud env get <key>        # Get a value
agentuity cloud env set <key> <val>  # Set a value
agentuity cloud env delete <key>     # Delete a value
agentuity cloud env pull             # Pull cloud env to local .env
agentuity cloud env push             # Push local .env to cloud
agentuity cloud env import <file>    # Import from file
```

## Region Configuration

Before using `--region` flags, check if region is already configured:

```bash
cat ~/.config/agentuity/config.json 2>/dev/null | grep region
cat agentuity.json 2>/dev/null | grep region
```

If region is set in config, the `--region` flag is unnecessary.

```bash
agentuity region list                # Show available regions
```

## Cloud Services

### Key-Value Storage

```bash
# Namespaces
agentuity cloud kv list-namespaces --json
agentuity cloud kv create-namespace <name>
agentuity cloud kv delete-namespace <name>

# Operations
agentuity cloud kv set <namespace> <key> <value> [ttl]
agentuity cloud kv get <namespace> <key> --json
agentuity cloud kv keys <namespace> --json
agentuity cloud kv search <namespace> <keyword> --json
agentuity cloud kv delete <namespace> <key>
agentuity cloud kv stats --json
```

### Vector Search

```bash
agentuity cloud vector upsert <ns> <key> --document "text" --json
agentuity cloud vector search <ns> "query" --limit 10 --json
agentuity cloud vector get <ns> <key> --json
agentuity cloud vector delete <ns> <key> --no-confirm
```

### Object Storage (S3-Compatible)

```bash
agentuity cloud storage list --json
agentuity cloud storage create --json
agentuity cloud storage upload <bucket> <file> --key <path>
agentuity cloud storage download <bucket> <filename> [output]
agentuity cloud storage list <bucket> [prefix] --json
agentuity cloud storage delete <bucket> <filename>
```

### Database (PostgreSQL)

```bash
agentuity cloud db create <name> [--description "text"] --json
agentuity cloud db list --json
agentuity cloud db sql <name> "<query>" --json
agentuity cloud db get <name> --json
agentuity cloud db delete <name>
```

### Sandbox (Isolated Execution)

```bash
# Runtimes
agentuity cloud sandbox runtime list --json

# One-shot execution
agentuity cloud sandbox run [--memory 1Gi] [--cpu 1000m] \
  [--runtime <name>] -- <command>

# Persistent sandbox
agentuity cloud sandbox create --json [--memory 1Gi] \
  [--network] [--port <1024-65535>] [--runtime <name>]
agentuity cloud sandbox exec <id> -- <command>
agentuity cloud sandbox list --json
agentuity cloud sandbox get <id> --json
agentuity cloud sandbox delete <id>

# File operations (default working dir: /home/agentuity)
agentuity cloud sandbox files <id> [path] --json
agentuity cloud sandbox cp ./local <id>:/home/agentuity
agentuity cloud sandbox cp <id>:/home/agentuity ./local
agentuity cloud sandbox mkdir <id> /path/to/dir
agentuity cloud sandbox rm <id> /path/to/file

# Environment variables
agentuity cloud sandbox env <id> VAR1=value1 VAR2=value2
agentuity cloud sandbox env <id> --delete VAR1

# Snapshots
agentuity cloud sandbox snapshot create <id> [--name <name>] [--tag <tag>]
agentuity cloud sandbox snapshot list --json
```

### Queue (Message Queues)

```bash
agentuity cloud queue create <name> --json
agentuity cloud queue list --json
agentuity cloud queue get <name> --json
agentuity cloud queue publish <name> <message>
agentuity cloud queue receive <name> --json
agentuity cloud queue ack <name> <messageId>
agentuity cloud queue nack <name> <messageId>
agentuity cloud queue pause <name>
agentuity cloud queue resume <name>
agentuity cloud queue stats <name> --json
agentuity cloud queue delete <name>
```

### Email

```bash
agentuity cloud email create <address> --json
agentuity cloud email list --json
agentuity cloud email send <from> --to <to> --subject "..." --body "..."
agentuity cloud email inbound list --json
agentuity cloud email outbound list --json
agentuity cloud email stats --json
```

### Streams

```bash
agentuity cloud stream create <name> --json
agentuity cloud stream list --json
agentuity cloud stream get <name> --json
agentuity cloud stream stats <name> --json
agentuity cloud stream delete <name>
```

### SSH (Remote Access)

```bash
agentuity cloud ssh                              # Current project
agentuity cloud ssh <projectId>                  # Specific project
agentuity cloud ssh <projectId> 'command'        # Run command
agentuity cloud ssh <sandboxId>                  # SSH into sandbox

# File transfer
agentuity cloud scp upload ./file --identifier=<id>
agentuity cloud scp download /path/file --identifier=<id>
```

## Deployments

```bash
agentuity cloud deployment list --json
agentuity cloud deployment show <id> --json
agentuity cloud deployment logs <id>
agentuity cloud deployment rollback <id>
agentuity cloud deployment remove <id>
```

## Project Management

```bash
agentuity project list               # List projects
agentuity project show               # Show current project
agentuity project create             # Create new project
agentuity project delete             # Delete project
agentuity project add database       # Add a database to project
agentuity project add storage        # Add storage bucket
agentuity project add domain         # Add custom domain
```

## Useful Patterns

### Check What's Available

```bash
agentuity --help                     # Top-level help
agentuity cloud --help               # Cloud services
agentuity ai schema show             # Full CLI schema as JSON
```

### JSON Output

Most commands support `--json` for machine-readable output — useful for scripting and agent automation.

### Profiles

```bash
agentuity profile list               # List profiles
agentuity profile use <name>         # Switch profile
agentuity profile create             # Create new profile
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| Using npm/pnpm in Agentuity projects | Always use `bun` |
| Guessing CLI flags | Run `agentuity <cmd> --help` first |
| Adding `--region` when already configured | Check config files first |
| Hardcoding sandbox paths as `/app` | Default working dir is `/home/agentuity` |
| Fabricating deployment URLs | Read actual command output |
