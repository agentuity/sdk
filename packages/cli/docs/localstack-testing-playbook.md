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

| Secret Name        | Purpose                         | Destination                       |
| ------------------ | ------------------------------- | --------------------------------- |
| `GLUON_GCP_CREDS`  | GCP service account credentials | `~/.agentuity-gluon-sa.json`      |
| `GLUON_LOCALSTACK` | Gluon localstack profile config | `~/.config/gluon/localstack.yaml` |
| `GCP_DOCKER`       | Docker registry credentials     | Used with `docker login`          |
| `AGENTUITY_USC`    | CLI profile for v1 API          | `~/.config/agentuity/usc.yaml`    |

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
# Store GCP credentials from GLUON_GCP_CREDS secret
echo "$GLUON_GCP_CREDS" > ~/.agentuity-gluon-sa.json

# Set environment variable (add to ~/.bashrc for persistence)
export GOOGLE_APPLICATION_CREDENTIALS=$HOME/.agentuity-gluon-sa.json
```

### 3. Create Gluon Localstack Profile

Create `~/.config/gluon/localstack.yaml` with the content from the `GLUON_LOCALSTACK` secret.

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

# Set USER to your ClickHouse database name
# Each developer has their own ClickHouse database named after their username
# Use an existing database name (e.g., "pedro") or have one created for you
USER=<your_clickhouse_db_name> npm run dev
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

Create `~/.config/agentuity/usc.yaml` with the content from the `AGENTUITY_USC` secret (properly formatted):

```yaml
name: 'usc'
overrides:
   api_url: 'https://api-v1.agentuity.com'
   app_url: 'https://app-v1.agentuity.com'
   transport_url: 'https://catalyst-usc.agentuity.cloud'
   stream_url: 'https://streams-usc.agentuity.cloud'
   kv_url: 'https://catalyst-usc.agentuity.cloud'
   object_url: 'https://catalyst-usc.agentuity.cloud'
   vector_url: 'https://catalyst-usc.agentuity.cloud'
   catalyst_url: 'https://catalyst-usc.agentuity.cloud'
   gravity_url: 'grpc://gravity-usc.agentuity.cloud'
```

### 3. Set Active Profile

```bash
echo "usc" > ~/.config/agentuity/profile
```

### 4. Authenticate CLI

The CLI needs authentication credentials. There are two ways to authenticate:

#### Option A: Browser-Based Authentication (Interactive)

```bash
cd /home/ubuntu/repos/sdk
./packages/cli/bin/cli.ts auth login
```

Follow the prompts to authenticate via browser.

#### Option B: Browserless Authentication (Automated/CI)

For automated testing or CI environments, you can authenticate using environment variables. A test user has been pre-created in the database for this purpose:

| Field   | Value                  |
| ------- | ---------------------- |
| User ID | `user_devin_test_001`  |
| Email   | `devin@agentuity.test` |
| Org ID  | `org_devin_test_001`   |

```bash
# Get an API key from the short-token endpoint using the devin test user
APIKEY=$(curl -s http://127.0.0.1:3012/cli/auth/short-token \
  -H 'Content-Type: application/json' \
  -d '{"secret":"<AGENTUITY_CATALYST_SECRET>","userId":"user_devin_test_001"}' \
  | jq -r '.data.apiKey')

# Set environment variables for CLI authentication
export AGENTUITY_API_URL="http://127.0.0.1:3012"
export AGENTUITY_USER_ID="user_devin_test_001"
export AGENTUITY_CLI_API_KEY="$APIKEY"

# Now CLI commands will use these credentials
./packages/cli/bin/cli.ts auth whoami
```

**Note:** The `AGENTUITY_CATALYST_SECRET` can be found in the `agentuity/app/api/.dev.vars` file after starting the local stack.

### 5. Test CLI

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
  --template-dir ./templates \
  --no-install \
  --no-build \
  --no-register
```

### Deploy to Local Stack

```bash
./packages/cli/bin/cli.ts deploy --dir /tmp/test-project
```

## Troubleshooting

### ClickHouse Database Error

**Error:** `Database ubuntu does not exist`

**Cause:** The `CLICKHOUSE_DATABASE` environment variable is set to `${env:USER}` in gluon, which resolves to the VM username (e.g., "ubuntu").

**Solution:** Run the stack with a USER that has an existing ClickHouse database:

```bash
USER=pedro npm run dev
```

Or have a new database created for your username.

### Port 22 Conflict

**Error:** `failed to bind port 0.0.0.0:22/tcp: address already in use`

**Cause:** The ion container tries to bind to port 22, which is used by SSH.

**Solution:** Change the port mapping in `docker-compose.yml`:

```yaml
# Change "22:22" to "2222:22" in the ion service ports section
```

### Gluon Profile Not Found

**Error:** `profile not found: localstack`

**Cause:** The gluon profile file doesn't exist or is malformed.

**Solution:** Ensure `~/.config/gluon/localstack.yaml` exists with properly formatted YAML.

### Docker Authentication Failed

**Error:** `unauthorized: authentication failed` when pulling images

**Cause:** Docker is not authenticated with GCP Artifact Registry.

**Solution:** Run:

```bash
echo "$GCP_DOCKER" | docker login -u _json_key --password-stdin https://us-central1-docker.pkg.dev
```

### YAML Parsing Errors

**Error:** `mapping values are not allowed in this context`

**Cause:** YAML file has incorrect formatting (often from secrets stored as single lines).

**Solution:** Ensure YAML files have proper newlines and indentation. Use a YAML validator to check formatting.

### Socket Connection Closed Unexpectedly (Bun/IPv6 Issue)

**Error:** `The socket connection was closed unexpectedly` with `code: "ECONNRESET"`

**Cause:** Bun's fetch has issues connecting to Docker containers via IPv6. On systems where `localhost` resolves to `::1` (IPv6) first, Bun will fail to connect even though the Docker container is listening on both IPv4 and IPv6.

**Solution:** Use `127.0.0.1` instead of `localhost` in all URL configurations:

```bash
# Check how localhost resolves on your system
getent hosts localhost
# If it shows "::1 localhost", use 127.0.0.1 instead

# Set environment variable with IPv4 address
export AGENTUITY_API_URL="http://127.0.0.1:3012"

# Or update your CLI profile to use 127.0.0.1
```

**Verification:** Test with curl (which is more forgiving) vs Bun:

```bash
# This may work with curl but fail with Bun's fetch
curl http://localhost:3012/cli/auth/user

# This should work with both
curl http://127.0.0.1:3012/cli/auth/user
```

## Key URLs and Ports

**Important:** Use `127.0.0.1` instead of `localhost` in all URLs. Bun's fetch has issues with IPv6 connections to Docker containers, and `localhost` may resolve to IPv6 (`::1`) on some systems.

| Service            | Local URL              | Port  |
| ------------------ | ---------------------- | ----- |
| API                | http://127.0.0.1:3012  | 3012  |
| Catalyst           | http://127.0.0.1:3939  | 3939  |
| Gravity            | grpc://127.0.0.1:8443  | 8443  |
| Pulse              | http://127.0.0.1:10101 | 10101 |
| Hadron             | http://127.0.0.1:9999  | 9999  |
| Redis              | 127.0.0.1:6379         | 6379  |
| etcd               | 127.0.0.1:2379         | 2379  |
| Ion SSH (remapped) | 127.0.0.1:2222         | 2222  |
| Ion HTTPS          | 127.0.0.1:443          | 443   |

## Notes

- The local stack is a replica of the production cloud environment
- Each developer has their own ClickHouse database named after their username
- The `docker-compose.yml` port change for ion should NOT be committed
- The CLI in `agentuity/sdk/packages/cli` is the new CLI (not the old `agentuity/cli` repo)
- Always run `bun run build` in the SDK repo after making changes
