# Test Scripts

This directory contains test scripts for validating the Agentuity SDK functionality.

## Quick Start

### Run All Tests

```bash
# From test-app directory
./scripts/test.sh
```

This runs the complete test suite and checks for orphaned processes.

### Check Dependencies First

```bash
./scripts/validate-dependencies.sh
```

## Available Test Scripts

### test.sh (Master Test Runner)

Runs all test scripts in sequence with progress tracking and orphan process detection.

**Prerequisites:**

- All test dependencies installed (see validate-dependencies.sh)
- `bun` installed
- Agentuity CLI installed

**Usage:**

```bash
./scripts/test.sh
```

**Features:**

- Runs all tests in sequence
- Tracks pass/fail/skip counts
- Detects orphaned processes after each test
- Cleans up gravity and bun dev processes
- Interactive mode: prompts to continue on failures
- CI mode: auto-detects CI environment and fails fast

**What it runs:**

1. Server Management
2. Subagents
3. Agent Event Listeners
4. Binary Storage API
5. Binary Storage Agent
6. KeyValue Storage
7. Vector Storage
8. Stream Storage
9. Email
10.   Hot Reload
11.   Build Metadata
12.   Env & Secrets (only if authenticated)

**Expected output:**

```
=========================================
  Agentuity Test App - Master Test Suite
=========================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Running: Server Management
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PASSED: Server Management

...

=========================================
  Authenticated Test Summary
=========================================
Total Tests:  12
Passed:       12
Failed:       0
Skipped:      0
=========================================

✓ No orphaned processes detected

All tests passed!
```

### test-server-management.sh

Tests server start/stop functionality and basic HTTP endpoints.

**Usage:**

```bash
./scripts/test-server-management.sh
```

**What it tests:**

- Server is not running initially
- Server starts successfully
- Server responds to HTTP requests
- Server stops cleanly
- Port cleanup

### test-subagents.sh

Tests nested agent functionality with parent/child relationships.

**Usage:**

```bash
./scripts/test-subagents.sh
```

**What it tests:**

- Parent agent functionality
- Subagent nested access (ctx.agent.team.members)
- Parent context access (ctx.parent)
- Agent name with dot notation (team.members)
- Route pattern inheritance
- CRUD operations on subagents

### test-events.sh

Tests agent-level and app-level event listeners.

**Usage:**

```bash
./scripts/test-events.sh
```

**What it tests:**

- Agent-level 'started' and 'completed' events
- App-level 'agent.started' and 'agent.completed' events
- Thread lifecycle events
- Session lifecycle events
- State persistence across requests

### test-binary-storage.sh

Tests binary object storage API endpoints for data integrity.

**Prerequisites:**

- `jq` installed (for JSON parsing)
- `md5sum` or `md5` available (for checksum verification)

**Usage:**

```bash
./scripts/test-binary-storage.sh
```

**What it tests:**

- Random binary data (1KB)
- Problematic bytes (null bytes, high bytes: 0x00, 0xFF, 0xFE, etc.)
- MD5 checksum verification
- Byte-by-byte comparison
- Public URL generation

### test-binary-agent.sh

Tests binary object storage through agent endpoints.

**Usage:**

```bash
./scripts/test-binary-agent.sh
```

**What it tests:**

- Text data storage and retrieval
- Binary data with problematic bytes
- Large binary data (1KB random)
- Delete operations
- Data integrity verification

### test-keyvalue.sh

Tests key-value storage CRUD operations.

**Usage:**

```bash
./scripts/test-keyvalue.sh
```

**What it tests:**

- Set operation
- Get operation
- Update operation
- Delete operation
- Multiple keys

### test-vector.sh

Tests vector storage and semantic search functionality.

**Usage:**

```bash
./scripts/test-vector.sh
```

**What it tests:**

- Upsert vector documents
- Get vector by key
- GetMany operation
- Semantic search
- Filtered search by metadata
- Vector store existence check
- Delete operations

### test-stream.sh

Tests stream storage for various content types.

**Usage:**

```bash
./scripts/test-stream.sh
```

**What it tests:**

- text/plain content type
- application/json content type
- image/png binary content (base64)
- application/octet-stream ArrayBuffer
- SHA256 integrity checks
- List operation
- Delete operation

### test-email.sh

Tests email routing and processing.

**Usage:**

```bash
./scripts/test-email.sh
```

**What it tests:**

- Plain text emails
- HTML emails
- Mixed/multipart emails with attachments
- Default and custom responses
- Content-Type validation
- Case-insensitive headers

### test-dev-reload.sh

Tests dev server hot reload functionality when source files change.

**Prerequisites:**

- `curl` installed (for HTTP requests)
- Git repository (for restoring changed files)

**Usage:**

```bash
./scripts/test-dev-reload.sh
```

**What it tests:**

- Dev server starts successfully
- Original agent response is correct
- File changes are detected by the watcher
- Server restarts automatically on file change
- Modified agent response reflects the changes
- File restoration triggers another reload
- Restored agent response matches original

**Note:** The script automatically cleans up:

- Stops the dev server and gravity processes
- Restores any modified files with `git checkout`
- Removes temporary log files

### test-build-metadata.ts

Tests build metadata generation and validation.

**Usage:**

```bash
bun scripts/test-build-metadata.ts
```

**What it tests:**

- Metadata file exists
- Schema validation
- Routes validation
- Agents validation (including subagents)
- Assets validation
- Project metadata
- Deployment metadata

### test-env-secrets.ts

Tests environment variable and secret management CLI commands.

**Prerequisites:**

- `bun` installed
- **CLI authentication required** - You must be logged in via `agentuity auth login`
- Project must have `agentuity.json` configured

**Usage:**

```bash
bun scripts/test-env-secrets.ts
```

**What it tests:**

- Environment variable operations (set, get, list, push, pull, delete, import)
- Secret operations (set, get, list, push, pull, delete)
- Masking/unmasking behavior with `--mask` and `--no-mask` flags
- File preservation checks (.env and .env.production)

**Note:** This test requires authentication and is only run by the master test suite if you're logged in.

### validate-dependencies.sh

Validates that all required dependencies for test scripts are installed.

**Usage:**

```bash
./scripts/validate-dependencies.sh
```

**Checks for:**

- `curl` (required)
- `jq` (required)
- `dd` (required)
- `md5sum` or `md5` (required)

### test-lib.sh

Shared library providing common functions for test scripts.

**Functions:**

- `cleanup()` - Stops servers, kills gravity processes, cleans up temp files
- `check_server()` - Checks if server is running
- `wait_for_server()` - Waits for server to be ready
- `start_server_if_needed()` - Starts server only if not already running

**Usage:**

```bash
# In your test script
source "$(dirname "$0")/test-lib.sh"

# Server will auto-start if needed
# Cleanup happens automatically on exit
```

## Process Management

All test scripts now properly handle process cleanup:

1. **Gravity processes** - Killed before stopping the dev server
2. **Dev server** - Gracefully terminated with SIGTERM
3. **Port cleanup** - Any remaining processes on port 3500 are force-killed
4. **Orphan detection** - Master test suite detects and reports orphaned processes

**Key improvements:**

- Stdin redirected to `/dev/null` to prevent terminal blocking
- No job control (`set -m`) to avoid process group issues
- No `disown` to ensure `wait` can track process termination
- Explicit gravity cleanup in all scripts

## Running Tests

### Run All Tests

```bash
cd apps/testing/auth-app
./scripts/test.sh
```

### Run Individual Test

```bash
cd apps/testing/auth-app
./scripts/test-server-management.sh
```

### Run TypeScript Tests

```bash
cd apps/testing/auth-app
bun scripts/test-build-metadata.ts
bun scripts/test-env-secrets.ts  # Requires authentication
```

## Troubleshooting

### Port Already in Use

Error: `Port 3500 is already in use`

Solution: Kill any existing processes on port 3500:

```bash
lsof -ti:3500 | xargs kill -9
```

### Orphaned Processes

If tests fail and leave orphaned processes:

```bash
# Kill bun dev processes
pkill -9 -f "bun.*dev"

# Kill gravity processes
pkill -9 -f gravity

# Kill anything on port 3500
lsof -ti:3500 | xargs kill -9
```

### Server Fails to Start

Check the server logs (path shown in test output). Common issues:

- Port 3500 already in use
- Build errors in the application
- Missing dependencies
- Missing or invalid `.env` file

Manual test:

```bash
cd apps/testing/auth-app
bun run dev
```

### Tests Hang

If tests hang when run from terminal but work when run non-interactively:

- Ensure stdin is redirected: `./script.sh < /dev/null`
- Check that `disown` is not being used in background processes
- Verify process cleanup in exit handlers

### Authentication Required

Some tests require authentication:

```bash
# Login first
agentuity auth login

# Then run tests
./scripts/test.sh
```

### Missing Dependencies

Error: `jq: command not found`

Solution:

```bash
# macOS
brew install jq curl

# Ubuntu/Debian
sudo apt-get install jq curl

# Check all dependencies
./scripts/validate-dependencies.sh
```

## Adding New Test Scripts

When adding new test scripts:

1. **Use the shared library:**

   ```bash
   #!/bin/bash
   set -e

   source "$(dirname "$0")/test-lib.sh"

   # Your tests here
   # Cleanup happens automatically
   ```

2. **For standalone scripts, ensure proper cleanup:**

   ```bash
   cleanup() {
       # Kill gravity first
       pkill -9 -f gravity 2>/dev/null || true

       # Kill server
       if [ -n "$SERVER_PID" ]; then
           kill "$SERVER_PID" 2>/dev/null || true
           wait "$SERVER_PID" 2>/dev/null || true
       fi

       # Clean up port
       lsof -ti:3500 | xargs kill -9 2>/dev/null || true
   }

   trap cleanup EXIT INT TERM
   ```

3. **Start servers with stdin redirected:**

   ```bash
   bun run dev < /dev/null > "$LOG_FILE" 2>&1 &
   SERVER_PID=$!
   ```

4. **Make executable:**

   ```bash
   chmod +x scripts/your-script.sh
   ```

5. **Add to test.sh:**

   ```bash
   run_test "Your Feature" "your-script.sh"
   ```

6. **Document in this README**

## Script Standards

- Use bash shebang: `#!/bin/bash`
- Enable error checking: `set -e`
- Use colors for output (GREEN for success, RED for failure)
- Source test-lib.sh for common functions
- Clean up processes and temp files with trap
- Redirect stdin when spawning background processes
- Kill gravity processes before stopping server
- Provide clear error messages
- Exit with non-zero code on failure
