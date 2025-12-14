---
name: agentuity-cli
description: Skills for using the Agentuity CLI for project scaffolding, development, deployment, storage management, skills linking, and evaluations.
globs: []
---

# Agentuity CLI Skills

Reference: https://preview.agentuity.dev/v1/Reference/CLI

## Using CLI for Project Scaffolding

### When to Use

- Creating a new Agentuity agent project from scratch
- Initializing projects with specific templates
- Setting up project structure with agents and APIs

### Commands

```bash
# Create new project (interactive flow)
agentuity project create

# Create with specific name
agentuity project create --name my-ai-agent

# Create in specific directory
agentuity project create --name customer-service --dir ~/projects/agent

# Use specific template
agentuity project create --template basic

# Skip dependency installation
agentuity project create --no-install

# Skip build step
agentuity project create --no-build

# Skip cloud registration (local-only project)
agentuity project create --no-register

# Use local template directory (for testing)
agentuity project create --template-dir ./packages/templates

# Aliases work too
agentuity new --name my-agent
agentuity init
```

### Key Patterns

- Templates are fetched from GitHub (`agentuity.sh/template/sdk/main`)
- Projects require: `package.json`, `app.ts`, and `src/` directory
- Dependencies installed automatically unless `--no-install` specified
- Projects registered with Agentuity Cloud unless `--no-register` specified

### Common Pitfalls

- Forgetting to authenticate first (`agentuity auth login`) when registering projects
- Creating projects without Bun installed (Bun 1.3+ required)
- Template names are case-sensitive

---

## Using CLI for Local Development

### When to Use

- Running agents locally with hot reload
- Testing agents with the workbench UI
- Developing with public tunnels for webhook testing
- Debugging agent behavior

### Commands

```bash
# Start dev server with hot reload
agentuity dev

# Use custom port
agentuity dev --port 8080

# Local mode (use local services, no cloud)
agentuity dev --local

# Disable public URL tunnel
agentuity dev --no-public

# Watch additional directories for changes
agentuity dev --watch ../packages/workbench/dist
```

### Key Patterns

- Default port is 3500 (or `PORT` env var)
- Workbench available at `http://127.0.0.1:3500/workbench`
- Public URL generated via Gravity tunnel (requires auth)
- Environment loaded from `.env` files based on profile
- Creating empty directory in `src/agent/` auto-generates agent template
- Creating empty directory in `src/api/` auto-generates API route template

### Keyboard Shortcuts (Interactive Mode)

- `h` - Show help
- `c` - Clear console
- `r` - Restart server
- `o` - Show routes
- `a` - Show agents
- `q` - Quit

### Common Pitfalls

- Running in non-project directory (requires `package.json`, `app.ts`, `src/`)
- Missing `AGENTUITY_SDK_KEY` in `.env` file
- Port conflicts (specify different port with `--port`)
- Running without authentication when needing public URL

---

## Using CLI for Deployment

### When to Use

- Deploying agents to Agentuity Cloud
- Setting up CI/CD pipelines
- Managing production deployments
- Syncing environment variables and secrets

### Commands

```bash
# Deploy current project
agentuity cloud deploy

# Deploy with verbose output
agentuity cloud deploy --log-level=debug

# Deploy with tags
agentuity cloud deploy --tag production --tag v1.0.0

# Deploy with CI metadata
agentuity cloud deploy --commit-url https://github.com/... --logs-url https://...

# Alias
agentuity deploy
```

### Key Patterns

- Syncs `.env.production` (or `.env`) to cloud env/secrets automatically
- `SECRET_*` prefixed variables are stored as encrypted secrets
- Builds, packages, encrypts and uploads deployment artifacts
- Custom domains validated before deployment
- Deployment URLs provided after successful deploy

### Deployment Steps

1. Validate custom domains (DNS check)
2. Sync environment variables and secrets
3. Create deployment record
4. Build, verify, and package
5. Encrypt and upload deployment
6. Provision deployment

### Common Pitfalls

- Deploying without authentication (`agentuity auth login` first)
- Missing project registration (run from project with `agentuity.json`)
- Build failures - check TypeScript errors before deploying
- DNS not configured for custom domains

---

## Managing Storage with CLI

### When to Use

- Inspecting key-value storage contents
- Managing vector embeddings
- Uploading/downloading files from object storage
- Debugging data issues

### Key-Value Commands

```bash
# Interactive REPL
agentuity cloud keyvalue repl
agentuity cloud kv repl

# Get/set values
agentuity cloud kv get mykey
agentuity cloud kv set mykey "myvalue"
agentuity cloud kv delete mykey

# List and search
agentuity cloud kv keys
agentuity cloud kv search "pattern"
agentuity cloud kv stats

# Namespace management
agentuity cloud kv list-namespaces
agentuity cloud kv create-namespace myns
agentuity cloud kv delete-namespace myns
```

### Vector Commands

```bash
# Search by text query
agentuity cloud vector search "query text"
agentuity cloud vec search "similar documents"

# Get vector by ID
agentuity cloud vec get <id>

# Delete vector
agentuity cloud vec delete <id>
```

### Object Storage Commands

```bash
# List files
agentuity cloud storage list
agentuity cloud s3 list

# Upload/download
agentuity cloud storage upload ./file.txt
agentuity cloud storage download file.txt ./local.txt

# File operations
agentuity cloud storage get filename.txt
agentuity cloud storage delete filename.txt
agentuity cloud storage create --name newfile.txt
```

### Key Patterns

- Aliases: `kv` for `keyvalue`, `vec` for `vector`, `s3` for `storage`
- All storage commands require authentication and project context
- REPL mode for interactive exploration of key-value data

### Common Pitfalls

- Running storage commands without deploying first
- Confusing namespaces (default namespace vs custom)
- Large file uploads may timeout - use chunking for big files

---

## Managing Skills with CLI

### When to Use

- Setting up Claude/Amp skill files for AI-assisted development
- After installing or updating @agentuity packages
- Sharing SDK documentation with AI coding assistants

### Commands

```bash
# Link skills from installed @agentuity packages
agentuity ai skills link

# Force overwrite existing skill files
agentuity ai skills link --force

# Copy files instead of symlinks (Windows compatibility)
agentuity ai skills link --copy

# Link skills in specific directory
agentuity ai skills link --dir /path/to/project
```

### Key Patterns

- Skills linked to `.claude/skills/` directory
- Creates symlinks by default (falls back to copy on Windows)
- Looks for skills in: `node_modules/@agentuity/{package}/skills/SKILL.md`
- Supported packages: `runtime`, `react`, `cli`, `core`, `schema`, `server`
- Output files named: `agentuity-{package}.md`

### When Skills Are Linked Automatically

- During `agentuity project create` (after dependency install)
- During `agentuity dev` (if `.claude/skills/` is missing)

### Common Pitfalls

- Running before `bun install` (packages not installed)
- Symlinks not supported on some Windows configurations (use `--copy`)
- Existing files not overwritten without `--force`

---

## Running Evaluations with CLI

### When to Use

- Testing agent quality with automated evaluations
- Running evals in CI/CD pipelines
- Validating agent behavior before deployment

### Commands

```bash
# Run all evaluations for a project
agentuity eval run

# Run specific agent's evaluations
agentuity eval run --agent my-agent

# Run with verbose output
agentuity eval run --log-level=debug

# List available evaluations
agentuity eval list
```

### Key Patterns

- Evaluations defined in agent files using `defineEval`
- Evals synced to cloud during `agentuity dev` (if authenticated)
- Results visible in dashboard and CLI output
- Evals have versioning for tracking changes

### CI Integration

```yaml
# GitHub Actions example
- name: Run Evaluations
  run: |
    agentuity auth login --api-key ${{ secrets.AGENTUITY_API_KEY }}
    agentuity eval run
```

### Common Pitfalls

- Running evals without authentication
- Evals not defined in agent files
- Missing SDK key for cloud evaluation execution
