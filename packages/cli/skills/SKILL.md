---
name: agentuity-cli
description: "Use when: creating projects with agentuity create, running dev server, deploying to cloud, managing storage (kv, vector, object), or linking skills."
globs:
  - "**/agentuity.json"
  - "**/agentuity.*.json"
---

# Agentuity CLI

## Installation & Auth

```bash
# Install
curl -fsSL https://agentuity.sh | bash
# Or: bun add -g @agentuity/cli

# Authenticate
agentuity login
agentuity logout
agentuity signup
```

---

## Project Creation

```bash
# Interactive
agentuity create

# With options
agentuity create --name my-agent --template default --dir ~/projects

# Skip steps
agentuity create --no-install --no-build --no-register
```

**Templates:** `default`, `tailwind`, `openai`, `groq`, `xai`, `vercel-openai`

**Shortcuts:** `agentuity new`, `agentuity init`

---

## Development

```bash
# Start dev server (default port 3500)
agentuity dev

# Options
agentuity dev --port 8080
agentuity dev --local          # Offline mode, no cloud services
agentuity dev --no-public      # Disable public tunnel
agentuity dev --watch ../pkg   # Watch additional paths
```

**Keyboard shortcuts:** `h` help, `c` clear, `r` restart, `o` routes, `a` agents, `q` quit

**Workbench:** `http://localhost:3500/workbench`

**Local mode (`--local`):**
- No cloud services (KV, Vector, Object Storage disabled)
- Requires your own API keys in `.env`
- No public URL tunneling

---

## Deployment

```bash
# Deploy to cloud
agentuity deploy

# With tags
agentuity deploy --tag production --tag v1.0.0

# Management
agentuity cloud project list
agentuity cloud deploy list
agentuity cloud deploy rollback
agentuity cloud deploy undeploy
```

**What deploy does:**
1. Syncs `.env.production` (or `.env`) to cloud
2. Variables with `_SECRET`, `_KEY`, `_TOKEN`, `_PASSWORD`, `_PRIVATE` suffixes → encrypted secrets
3. Builds, packages, encrypts, uploads
4. Provisions and activates

**URLs after deploy:**
- Deployment URL: `dep_xxx.agentuity.cloud` (specific version)
- Project URL: `proj_xxx.agentuity.cloud` (always active deployment)

---

## Storage Commands

### Key-Value

```bash
agentuity cloud kv get <key>
agentuity cloud kv set <key> "<value>"
agentuity cloud kv delete <key>
agentuity cloud kv keys
agentuity cloud kv repl        # Interactive REPL
```

### Vector

```bash
agentuity cloud vector search "<query>"
agentuity cloud vec get <id>
agentuity cloud vec delete <id>
```

### Object (S3)

```bash
agentuity cloud storage list
agentuity cloud storage upload ./file.txt
agentuity cloud storage download file.txt ./local.txt
agentuity cloud s3 get filename.txt
agentuity cloud s3 delete filename.txt
```

**Aliases:** `kv` = `keyvalue`, `vec` = `vector`, `s3` = `storage`

---

## Environment & Secrets

```bash
agentuity cloud env list
agentuity cloud env set KEY=value
agentuity cloud env delete KEY

agentuity cloud secret list
agentuity cloud secret set SECRET_KEY=value
agentuity cloud secret delete SECRET_KEY
```

---

## Skills Management

```bash
# Link skills from @agentuity packages to .claude/skills/
agentuity ai skills link

# Options
agentuity ai skills link --force  # Overwrite existing
agentuity ai skills link --copy   # Copy instead of symlink (Windows)
```

Creates symlinks from `.claude/skills/agentuity-{package}.md` to `node_modules/@agentuity/{package}/skills/SKILL.md`.

---

## Debugging

```bash
# SSH into container
agentuity ssh

# View logs
agentuity cloud deploy logs

# Session inspection
agentuity cloud session list
agentuity cloud session get <id>
```

---

## Global Options

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable output |
| `--log-level <level>` | debug, trace, info, warn, error |
| `--quiet` | Suppress non-essential output |
| `--dry-run` | Simulate without executing |
| `--explain` | Show what command would do |

---

## Reference

- [CLI Reference](https://preview.agentuity.dev/v1/Reference/CLI)
- [Getting Started](https://preview.agentuity.dev/v1/Reference/CLI/getting-started)
- [Development](https://preview.agentuity.dev/v1/Reference/CLI/development)
- [Deployment](https://preview.agentuity.dev/v1/Reference/CLI/deployment)
