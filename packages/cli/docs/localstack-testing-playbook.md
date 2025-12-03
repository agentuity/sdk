# Agentuity Local Stack Testing Playbook

This playbook documents how to set up and run the Agentuity local stack for testing CLI deployments and other cloud features. The local stack is a replica of the production cloud environment.

## Overview

The local stack runs the entire Agentuity platform locally using Docker Compose, allowing you to test features as if they were in production. This is essential for testing CLI commands like `project create`, `deploy`, and other cloud operations.

## Prerequisites

### Required Repositories

Clone the following repositories to `/home/ubuntu/repos/`:

```bash
git clone https://github.com/agentuity/app.git
git clone https://github.com/agentuity/gluon.git
git clone https://github.com/agentuity/sdk.git
```

### Required Secrets

The following secrets are needed (available as Devin secrets):

| Secret Name            | Purpose                         | Destination                       |
| ---------------------- | ------------------------------- | --------------------------------- |
| `LOCALSTACK_GCP_CREDS` | GCP service account credentials | `~/.agentuity-gluon-sa.json`      |
| `LOCALSTACK_GLUON`     | Gluon localstack profile config | `~/.config/gluon/localstack.yaml` |
| `LOCALSTACK_CONFIG`    | CLI profile for v1 API          | `~/.config/agentuity/local.yaml`  |
| `LOCALSTACK_USER`      | ClickHouse database username    | Used with `USER=` when starting   |
| `GCP_DOCKER`           | Docker registry credentials     | Used with `docker login`          |

## One-Time VM Setup

### 1. Install and Configure Gluon

```bash
# Build and install gluon
cd /home/ubuntu/repos/gluon
go install .

# Add to PATH (add to ~/.bashrc for persistence)
export PATH=$PATH:$HOME/go/bin

# Verify installation
gluon --help
gluon version
```

### 2. Set Up GCP Credentials

```bash
# Store GCP credentials from LOCALSTACK_GCP_CREDS secret
echo "$LOCALSTACK_GCP_CREDS" > ~/.agentuity-gluon-sa.json

# Set environment variable (add to ~/.bashrc for persistence)
export GOOGLE_APPLICATION_CREDENTIALS=$HOME/.agentuity-gluon-sa.json
```

### 3. Create Gluon Localstack Profile

Create `~/.config/gluon/localstack.yaml` with the content from the `LOCALSTACK_GLUON` secret.

**Important:** The secret may be stored as a single line. Ensure the YAML is properly formatted with newlines and indentation:

```yaml
name: localstack
etcd:
   ca_cert: |
      -----BEGIN CERTIFICATE-----
      ...
      -----END CERTIFICATE-----
   ca_key: |
      -----BEGIN EC PRIVATE KEY-----
      ...
      -----END EC PRIVATE KEY-----
   endpoints:
      - https://etcd-localstack.agentuity.com:2379
master_key: <base64-encoded-key>
provider: http
# ... additional configuration
```

### 4. Authenticate Docker with GCP Artifact Registry

```bash
echo "$GCP_DOCKER" | docker login -u _json_key --password-stdin https://us-central1-docker.pkg.dev
```

### 5. Install API Dependencies

```bash
cd /home/ubuntu/repos/app/api
npm install
```

### 6. Fix Port Conflict (Local-Only Change)

The ion container tries to bind to port 22 (SSH), which conflicts with the VM's SSH daemon. Change the port mapping in `docker-compose.yml`:

```yaml
# In the ion service section, change:
ports:
   - '22:22' # Original - conflicts with SSH
   # To:
   - '2222:22' # Fixed - maps to port 2222
```

**Do NOT commit this change** - it's only needed for VMs where SSH is running on port 22.

## Per-Session Stack Startup

### 1. Start the Local Stack

```bash
cd /home/ubuntu/repos/app/api

# Set USER to your ClickHouse database name (from LOCALSTACK_USER secret)
# Each developer has their own ClickHouse database named after their username
USER=$LOCALSTACK_USER npm run dev
```

The stack will pull Docker images and start approximately 11 containers:

- api, catalyst, pulse, aether, ion, gravity, hadron, redis, etcd, otel, qstash

### 2. Verify All Containers Are Healthy

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Expected output shows all containers as "Up" with most showing "(healthy)":

```
NAMES            STATUS
api-ion-1        Up X minutes (healthy)
api-hadron-1     Up X minutes (healthy)
api-gravity-1    Up X minutes (healthy)
api-catalyst-1   Up X minutes (healthy)
api-pulse-1      Up X minutes (healthy)
api-api-1        Up X minutes
api-otel-1       Up X minutes (healthy)
api-aether-1     Up X minutes (healthy)
api-etcd-1       Up X minutes
api-redis-1      Up X minutes (healthy)
api-qstash-1     Up X minutes
```

## CLI Setup for Local Stack Testing

### 1. Build the CLI

```bash
cd /home/ubuntu/repos/sdk
bun install
bun run build
```

### 2. Create CLI Profile

```bash
# Create the CLI profile from LOCALSTACK_CONFIG secret
mkdir -p ~/.config/agentuity
echo "$LOCALSTACK_CONFIG" > ~/.config/agentuity/local.yaml
```

**Important:** The CLI profile contains production-looking URLs (e.g., `https://api.agentuity.io`). Do NOT change these URLs to point to `localhost` or `127.0.0.1`. The local stack's gluon/ion/aether components handle routing these hostnames to local containers.

### 3. Set Active Profile

```bash
# The profile file should contain just the profile name, not the full path
echo "local" > ~/.config/agentuity/profile
```

### 4. Test CLI

No need to go through the login flow - the credentials are already loaded from the `local.yaml` config file. The auth section in the YAML profile contains pre-configured `api_key`, `user_id`, and `expires` fields.

```bash
cd /home/ubuntu/repos/sdk
./packages/cli/bin/cli.ts auth whoami
./packages/cli/bin/cli.ts project list
```

## CLI Testing Workflow

### Create a Test Project

```bash
cd /home/ubuntu/repos/sdk
./packages/cli/bin/cli.ts project create \
  --name test-project \
  --dir /tmp/test-project \
  --template-dir ./templates
```

**Important Notes:**

- Do NOT use `--no-register` flag if you want to deploy the project later. The `--no-register` flag skips creating the `agentuity.json` file, which is required for deployment.
- The CLI will prompt you to select an organization, template, and optionally create resources (SQL Database, Storage Bucket). You can skip the resource creation prompts.
- The project will be created in a subdirectory: `/tmp/test-project/test-project/`

### Deploy to Local Stack

```bash
# Note: The project is created in a subdirectory with the project name
./packages/cli/bin/cli.ts deploy --dir /tmp/test-project/test-project
```

The deployment will go through these steps:

1. Sync Env & Secrets
2. Create Deployment
3. Build, Verify and Package
4. Encrypt and Upload Deployment
5. Provision Deployment

Upon successful deployment, you'll receive:

- Deployment ID
- Deployment URL (e.g., `https://d7d12c4c4292f1a8e.agentuity.io`)
- Project URL (e.g., `https://p970c8e29d2710bf8.agentuity.io`)

## Troubleshooting

### "Invalid project folder" Error on Deploy

This error occurs when the `agentuity.json` file is missing from the project directory. This happens if you used the `--no-register` flag when creating the project. Create a new project without that flag.

### Container Constantly Restarting

If a container (e.g., `api-hadron-1`) is constantly restarting, check the container logs:

```bash
docker logs api-hadron-1
```

## Notes

- The local stack is a replica of the production cloud environment
- Each developer has their own ClickHouse database named after their username
- The `docker-compose.yml` port change for ion should NOT be committed
- The CLI in `agentuity/sdk/packages/cli` is the new CLI (not the old `agentuity/cli` repo)
- Always run `bun run build` in the SDK repo after making changes
- The CLI profile uses production-looking URLs that are routed to local containers by gluon/ion/aether
- No manual login is required - credentials are pre-configured in the `local.yaml` profile
- The `--no-register` flag should NOT be used if you want to deploy the project
