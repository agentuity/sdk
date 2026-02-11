---
name: agentuity-ops
description: When working with the Agentuity CLI, cloud services (KV, Vector, Storage, Sandbox, Database, SSH), deployments, or infrastructure. Activates when running agentuity commands, managing cloud resources, deploying projects, or configuring infrastructure.
version: 1.0.0
---

# Agentuity Ops Reference

Deep reference material for the Agentuity CLI, cloud services, deployments, and infrastructure.

## CLI Accuracy Contract (NON-NEGOTIABLE)

**Never hallucinate CLI flags, subcommands, URLs, or outputs.**

1. **Never guess** flags, subcommands, or argument order
2. If not 100% certain, FIRST run: `agentuity <cmd> --help`
3. **Trust CLI output over memory**
4. **Never fabricate URLs** — read actual command output
5. Provide **copy/paste-ready commands**

## CRITICAL: Region Configuration

Before suggesting `--region` flags, CHECK EXISTING CONFIG:

```bash
cat ~/.config/agentuity/config.json 2>/dev/null | grep region
cat agentuity.json 2>/dev/null | grep region
```

- If region is configured → NO `--region` flag needed
- If NOT configured → help user set it in config OR use `--region`

## CRITICAL: Agentuity Projects Use Bun (Always)

- If `agentuity.json` or `.agentuity/` exists → ALWAYS use `bun`
- Never suggest `npm` or `pnpm` for Agentuity projects

## Golden Commands

| Purpose           | Command                                                        |
| ----------------- | -------------------------------------------------------------- |
| Create project    | `agentuity new` (interactive) or `agentuity new --name <name>` |
| Start dev server  | `bun run dev` → read output for actual URL                     |
| Deploy            | `agentuity deploy` → read output for deployment URL            |
| Check auth        | `agentuity auth whoami`                                        |
| List regions      | `agentuity region list`                                        |
| Get CLI help      | `agentuity <command> --help`                                   |
| Show all commands | `agentuity ai schema show`                                     |

---

## Cloud Service Commands

### KV (Key-Value Storage)

```bash
# Namespace management
agentuity cloud kv list-namespaces --json
agentuity cloud kv create-namespace <name>
agentuity cloud kv delete-namespace <name> --json

# Key operations
agentuity cloud kv set <namespace> <key> <value> [ttl]
agentuity cloud kv get <namespace> <key> --json
agentuity cloud kv keys <namespace> --json
agentuity cloud kv search <namespace> <keyword> --json
agentuity cloud kv delete <namespace> <key> --json
agentuity cloud kv stats --json
```

### Storage (S3-compatible)

```bash
agentuity cloud storage list --json
agentuity cloud storage create --json
agentuity cloud storage upload <bucket> <file> --key <path> --json
agentuity cloud storage download <bucket> <filename> [output]
agentuity cloud storage list <bucket> [prefix] --json
agentuity cloud storage delete <bucket> <filename> --json
```

### Vector (Semantic Search)

```bash
agentuity cloud vector upsert <namespace> <key> --document "text" --json
agentuity cloud vector search <namespace> "query" --limit N --json
agentuity cloud vector get <namespace> <key> --json
agentuity cloud vector delete <namespace> <key> --no-confirm --json
```

### Sandbox (Isolated Execution)

```bash
# Runtimes
agentuity cloud sandbox runtime list --json

# Lifecycle
agentuity cloud sandbox run [--memory 1Gi] [--cpu 1000m] \
  [--runtime <name>] [--name <name>] [--description <text>] \
  -- <command>                                             # One-shot
agentuity cloud sandbox create --json [--memory 1Gi] \
  [--network] [--port <1024-65535>] \
  [--runtime <name>] [--name <name>]                       # Persistent
agentuity cloud sandbox exec <sandboxId> -- <command>
agentuity cloud sandbox list --json
agentuity cloud sandbox get <sandboxId> --json
agentuity cloud sandbox delete <sandboxId> --json

# File operations (default working dir: /home/agentuity)
agentuity cloud sandbox files <sandboxId> [path] --json
agentuity cloud sandbox cp ./local sbx_abc123:/home/agentuity
agentuity cloud sandbox cp sbx_abc123:/home/agentuity ./local
agentuity cloud sandbox mkdir <sandboxId> /path/to/dir
agentuity cloud sandbox rm <sandboxId> /path/to/file

# Environment variables
agentuity cloud sandbox env <sandboxId> VAR1=value1 VAR2=value2
agentuity cloud sandbox env <sandboxId> --delete VAR1

# Snapshots
agentuity cloud sandbox snapshot create <sandboxId> \
  [--name <name>] [--description <text>] [--tag <tag>]
agentuity cloud sandbox snapshot list --json
```

**Snapshot tags:** Default to `latest`. Max 128 chars, must match `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`.

### Network & Public URLs

| Scenario                                | Use `--network`? | Use `--port`? |
| --------------------------------------- | ---------------- | ------------- |
| Running tests locally                   | No               | No            |
| Installing npm packages                 | Yes              | No            |
| Running web server for internal testing | Yes              | No            |
| Exposing dev preview to share           | Yes              | Yes           |
| API that external services call         | Yes              | Yes           |

**Public URL format:** `https://s{identifier}.agentuity.run`

### SSH (Remote Access)

```bash
# SSH into deployed projects
agentuity cloud ssh                                         # Current project
agentuity cloud ssh proj_abc123                             # Specific project
agentuity cloud ssh proj_abc123 'tail -f /var/log/app.log'  # Run command

# SSH into sandboxes
agentuity cloud ssh sbx_abc123                              # Interactive shell

# File transfer
agentuity cloud scp upload ./config.json --identifier=proj_abc123
agentuity cloud scp download /var/log/app.log --identifier=deploy_abc123
```

### Database (Postgres)

```bash
agentuity cloud db create <name> [--description "<text>"] --json
agentuity cloud db list --json
agentuity cloud db sql <name> "<query>" --json
agentuity cloud db delete <name> --json
```

---

## Deployment Commands

```bash
# Deploy current project
agentuity deploy

# Deploy with specific environment
agentuity deploy --env production

# List deployments
agentuity cloud deployment list --json

# Get deployment details
agentuity cloud deployment get <deploymentId> --json
```

## Project Configuration

### agentuity.json

```json
{
	"projectId": "proj_abc123",
	"orgId": "org_xyz",
	"region": "use"
}
```

### CLI Profile (~/.config/agentuity/production.yaml)

Contains `orgId` from `preferences.orgId` — used as fallback when `agentuity.json` doesn't have orgId.

## Common Mistakes

| Mistake                            | Better Approach       | Why                                  |
| ---------------------------------- | --------------------- | ------------------------------------ |
| Blindly adding `--region` flag     | Check config first    | Region may already be configured     |
| Using npm for Agentuity projects   | Always use `bun`      | Agentuity is Bun-native              |
| Hardcoding sandbox paths as `/app` | Use `/home/agentuity` | That's the default working directory |
| Making up CLI flags                | Run `--help` first    | Flags change between versions        |
| Fabricating deployment URLs        | Read actual output    | URLs are generated dynamically       |
