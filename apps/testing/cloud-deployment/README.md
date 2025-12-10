# Cloud Deployment Integration Tests

End-to-end integration tests for the Agentuity CLI cloud deployment commands.

## What It Tests

- ✅ CLI authentication (`auth whoami`)
- ✅ Project deployment (`cloud deploy`)
- ✅ Deployment management (`cloud deployment list`, `show`, `remove`, `undeploy`)
- ✅ Deployment rollback (`cloud deployment rollback`)
- ✅ Agent management (`cloud agent list`, `get`)
- ✅ Session tracking (`cloud session get`, `list`, `logs`)
- ✅ Real HTTP invocation of deployed agents
- ✅ Cloud infrastructure interaction

## Architecture

This test suite is **standalone** with its own minimal agents:

```
cloud-deployment/
├── agentuity.json          # Project config (CI)
├── agentuity.local.json    # Project config (local)
├── src/
│   └── agent/
│       └── simple/        # Simple test agent
├── app.ts                 # Server entry point
├── tsconfig.json          # TypeScript config
├── package.json           # Build and test scripts
└── scripts/
    ├── test-deployment.sh  # Main test script
    └── test-lib.sh         # Shared utilities
```

## Prerequisites

### Local Testing

1. **Authenticated CLI**:
   ```bash
   bun ../../packages/cli/bin/cli.ts auth login
   ```

2. **Project Configuration**:
   - `agentuity.json` - CI project (used in GitHub Actions)
   - `agentuity.local.json` - Your local project (used with `profile=local`)
   - Create your own project ID in `agentuity.local.json` if empty

3. **Environment variables** (set via `.env` or export):
   - `AGENTUITY_SDK_KEY` - SDK key for runtime operations
   - `OPENAI_API_KEY` - For vector embedding operations

### CI Testing

CI automatically sets up:
- `AGENTUITY_CLI_API_KEY` - Generated from shared secret
- `AGENTUITY_SDK_KEY` - From GitHub secrets
- `OPENAI_API_KEY` - From GitHub secrets

## Running Tests

### Run Locally

The `bun test` command will:
1. Build the cloud-deployment app
2. Run the deployment tests

```bash
cd sdk/apps/testing/cloud-deployment
bun test
```

Or run steps manually:
```bash
bun run build                      # Build the app
bash scripts/test-deployment.sh    # Run tests only
```

### Run in CI

Tests run automatically in the `cloud-deployment-test` job in `.github/workflows/package-smoke-test.yaml`.

## Test Flow

1. **Pre-checks**:
   - Verify CLI authentication
   - Verify project config exists

2. **Deployment**:
   - Deploy project (creates first deployment)
   - Deploy again (creates second deployment for rollback test)

3. **Agent Operations**:
   - List agents
   - Get agent details by ID

4. **Session Operations**:
   - Invoke deployed agent endpoint
   - Capture session ID from response headers
   - Get session details
   - List sessions (with filters)
   - Get session logs

5. **Rollback**:
   - Rollback to previous deployment
   - Verify rollback succeeded

6. **Cleanup**:
   - Remove specific deployment
   - Undeploy all deployments
   - Verify undeploy worked

## Expected Output

```
=========================================
  Deployment Commands Test
=========================================

✓ Authenticated
✓ Project configuration found

Test 1: List deployments...
✓ Deployment list command succeeded

Test 2: Deploy project...
✓ Deploy command succeeded
Deployment ID: deploy_abc123

Test 2a: List agents...
✓ Agent list command succeeded
First Agent ID: agent_def456

Test 2b: Get agent details...
✓ Agent get command succeeded
✓ Agent details contain correct ID

... (more tests)

=========================================
✓ All deployment tests passed!
=========================================
```

## Troubleshooting

### Authentication Failures

```
✗ Not authenticated. Please run: bun <path>/cli.ts auth login
```

**Fix**: Run `bun ../../packages/cli/bin/cli.ts auth login`

### No agentuity.json

```
✗ No agentuity.json file found
```

**Fix**: Ensure you're in the `cloud-deployment/` directory

### Deployment Invoke Failures

```
⚠ Failed to invoke deployment after 3 attempts (skipping session tests)
```

**Known Issue**: Sometimes deployments return transient 500 errors immediately after provisioning. Tests will skip session validation but continue.

### Missing SDK Key

```
ERROR: No AGENTUITY_SDK_KEY found in .env
```

**Fix**: Set `AGENTUITY_SDK_KEY` environment variable or create `.env` file in `cloud-deployment/`

## Notes

- Tests use the **same agents** as integration-suite
- Each test run creates real cloud deployments
- Cleanup (undeploy) happens automatically at end
- Tests take ~3-5 minutes to complete
- Network timeouts are handled gracefully
