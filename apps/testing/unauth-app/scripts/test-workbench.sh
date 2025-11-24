#!/bin/bash
set -e

# Test workbench functionality with dev server
# - Tests workbench accessibility when createWorkbench() is present
# - Modifies app.ts to remove workbench
# - Tests 404 behavior 
# - Restores file with git

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Source shared test library
source "$SCRIPT_DIR/test-lib.sh"

APP_FILE="$APP_DIR/app.ts"
SERVER_LOG=$(mktemp "${TMPDIR:-/tmp}/test-workbench-XXXXXX")
SERVER_PID=""
PORT=3500
TEST_FAILED=false

log() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

fail_test() {
    TEST_FAILED=true
    error "$1"
    exit 1
}

cleanup() {
    log "Cleaning up..."
    
    # Dump server logs if test failed
    if [ "$TEST_FAILED" = true ] && [ -f "$SERVER_LOG" ]; then
        error "Server log (last 30 lines):"
        tail -30 "$SERVER_LOG"
    fi
    
    # Kill the dev server if running
    if [ -n "$SERVER_PID" ]; then
        log "Stopping dev server (PID: $SERVER_PID)"
        kill "$SERVER_PID" 2>/dev/null || true
        sleep 2
        if kill -0 "$SERVER_PID" 2>/dev/null; then
            kill -9 "$SERVER_PID" 2>/dev/null || true
        fi
        lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    fi
    
    # Restore original app.ts using git
    if ! git -C "$APP_DIR" diff --quiet "$APP_FILE" 2>/dev/null; then
        log "Restoring original app.ts with git..."
        git -C "$APP_DIR" checkout -- "$APP_FILE"
    fi
    
    # Clean up backup file from sed
    rm -f "$APP_FILE.bak"
    
    # Clean up temp files
    rm -f "$SERVER_LOG"
}

trap cleanup EXIT INT TERM

echo ""
log "Testing workbench with dev server"
log "App directory: $APP_DIR"

# Check if port is already in use
if lsof -Pi :3500 -sTCP:LISTEN -t >/dev/null 2>&1; then
    error "Port 3500 is already in use"
    lsof -Pi :3500 -sTCP:LISTEN
    exit 1
fi

# Start the dev server
log "Starting dev server..."
cd "$APP_DIR"
CLI_PATH="$(dirname "$(dirname "$APP_DIR")")/../packages/cli/bin/cli.ts"
bun "$CLI_PATH" dev --no-public < /dev/null > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

log "Dev server started (PID: $SERVER_PID)"

# Wait for server to be ready
TIMEOUT=30
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if [ -f "$SERVER_LOG" ] && grep -q "DevMode ready" "$SERVER_LOG"; then
        log "Server is ready!"
        break
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -eq $TIMEOUT ]; then
    fail_test "Server failed to start within $TIMEOUT seconds"
fi

sleep 2  # Wait for routes to be registered

# Phase 1: Test workbench accessibility
log "Phase 1: Testing workbench accessibility"
RESPONSE=$(curl -s http://localhost:3500/workbench)
if echo "$RESPONSE" | grep -q "workbench-root"; then
    log "✓ Workbench HTML accessible"
else
    error "✗ Workbench HTML not accessible"
    echo "Response: $RESPONSE"
    fail_test "Workbench should be accessible"
fi

# Phase 2: Comment out workbench and test 404
log "Phase 2: Commenting out workbench in app.ts (tests AST parsing ignores comments)"

# Comment out workbench code - this tests that AST parsing ignores commented code
# Use cp instead of sed to avoid temp files that get ignored by file watcher
cp "$APP_FILE" "$APP_FILE.bak"
sed -e 's/import { createWorkbench }/\/\/ import { createWorkbench }/' \
    -e 's/const workbench/\/\/ const workbench/' \
    -e 's/\t\tworkbench,/\/\/ \t\tworkbench,/' "$APP_FILE.bak" > "$APP_FILE"

log "Commented out workbench code - AST parser should ignore this and not bundle workbench"

log "Modified app.ts, triggering build to check .agentuity exclusion..."

# Trigger a build to check .agentuity directory
bun run build > /dev/null 2>&1

# Give build time to complete in CI environments
log "Waiting for build to complete..."
sleep 3

# Check that workbench is not in the build
AGENTUITY_DIR="$APP_DIR/.agentuity"
if [ -d "$AGENTUITY_DIR" ]; then
    # Check for workbench directory specifically (should not exist when removed)
    if [ -d "$AGENTUITY_DIR/workbench" ]; then
        error "✗ Workbench directory found in .agentuity build after removal"
        fail_test "Workbench directory should not exist in build when removed from app.ts"
    else
        log "✓ Workbench directory not found in .agentuity build (as expected)"
    fi
    
    # Check that routing code exists but workbench assets don't
    # (The routing code is statically included but checks for workbench directory at runtime)
    if grep -E "(workbench|/workbench)" "$AGENTUITY_DIR/app.js" > /dev/null 2>&1; then
        log "✓ Workbench routing code present but inactive (checks for directory at runtime)"
    else
        error "✗ Expected workbench routing code not found in bundle"
        # Debug: show what's actually in the bundle
        if [ -f "$AGENTUITY_DIR/app.js" ]; then
            error "Bundle size: $(wc -l < "$AGENTUITY_DIR/app.js") lines"
            error "Checking for workbench-related strings in bundle..."
            grep -in workbench "$AGENTUITY_DIR/app.js" || error "No workbench strings found"
        else
            error "Bundle file not found at $AGENTUITY_DIR/app.js"
        fi
    fi
else
    error "✗ .agentuity directory not found after build"
    fail_test ".agentuity directory should exist after build"
fi

log "Waiting for dev server reload..."

# Give the file system time to propagate changes in CI
sleep 2

# Wait for file change detection  
TIMEOUT=20
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if grep -q "Restarting on file change" "$SERVER_LOG"; then
        log "Server detected file change!"
        break
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -eq $TIMEOUT ]; then
    fail_test "Server did not detect file change within $TIMEOUT seconds"
fi

# Wait for restart to complete - increased for CI
log "Waiting for server restart..."
sleep 8

# Test workbench should now return 404
log "Testing workbench 404 behavior..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3500/workbench)
if [ "$STATUS" = "404" ]; then
    log "✓ Workbench properly returns 404 when removed"
else
    error "✗ Workbench should return 404 when removed"
    error "Expected: 404, Got: $STATUS"
    fail_test "Workbench 404 test failed"
fi

# Phase 3: Test custom configuration
log "Phase 3: Testing custom workbench configuration"

# Restore original file first
git -C "$APP_DIR" checkout -- "$APP_FILE"
log "Restored app.ts with git"

# Wait longer for git restore to complete and file system to stabilize
log "Waiting for file system to stabilize after git restore..."
sleep 5

# Modify to use custom route
log "Modifying app.ts to use custom route..."
cp "$APP_FILE" "$APP_FILE.tmp"
sed -e 's/const workbench = createWorkbench();/const workbench = createWorkbench({ route: "\/random" });/' "$APP_FILE.tmp" > "$APP_FILE"
rm "$APP_FILE.tmp"
log "Modified workbench config to use custom route '/random'"

# Kill the dev server and restart fresh for reliable configuration change
log "Stopping dev server for clean restart with new config..."
if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    sleep 2
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        kill -9 "$SERVER_PID" 2>/dev/null || true
    fi
    lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
fi

log "Starting fresh dev server with custom workbench config..."
CLI_PATH="$(dirname "$(dirname "$APP_DIR")")/../packages/cli/bin/cli.ts"
bun "$CLI_PATH" dev --no-public < /dev/null > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

log "Fresh dev server started (PID: $SERVER_PID)"

# Wait for server to be ready with new config
TIMEOUT=30
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if [ -f "$SERVER_LOG" ] && grep -q "DevMode ready" "$SERVER_LOG"; then
        log "Fresh server is ready with new config!"
        break
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -eq $TIMEOUT ]; then
    fail_test "Fresh server failed to start within $TIMEOUT seconds"
fi

# Give server extra time to fully initialize and start listening
log "Waiting for server to fully initialize..."
sleep 8

# Test custom route should work
log "Testing custom workbench route '/random'..."

# Debug: Check server status first
log "Debug: Checking server status before test..."

# Check if server process is still running
if kill -0 "$SERVER_PID" 2>/dev/null; then
    log "Debug: Server process $SERVER_PID is still running"
else
    error "Debug: Server process $SERVER_PID has died!"
fi

# Check if port is listening
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    log "Debug: Port $PORT is listening"
    log "Debug: Process on port: $(lsof -Pi :$PORT -sTCP:LISTEN -t)"
else
    error "Debug: Port $PORT is NOT listening!"
fi

# Check server logs for errors
log "Debug: Recent server logs (last 5 lines):"
tail -5 "$SERVER_LOG" | sed 's/^/  /'

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3500/random 2>/dev/null || echo "CURL_FAILED")
log "Debug: HTTP status for /random: $HTTP_STATUS"

# Debug: Check if workbench was actually configured
log "Debug: Current app.ts workbench config:"
grep -A 3 -B 1 "createWorkbench" "$APP_FILE" | sed 's/^/  /' || log "Debug: No createWorkbench found in app.ts"

CUSTOM_RESPONSE=$(curl -s http://localhost:3500/random)
log "Debug: Response length: ${#CUSTOM_RESPONSE} characters"
log "Debug: First 200 chars of response: ${CUSTOM_RESPONSE:0:200}"

if echo "$CUSTOM_RESPONSE" | grep -q "workbench-root"; then
    log "✓ Workbench accessible at custom route '/random'"
else
    error "✗ Workbench not accessible at custom route '/random'"
    echo "Full Response: $CUSTOM_RESPONSE"
    error "HTTP Status: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3500/random)"
    error "Server logs (last 10 lines):"
    tail -10 "$SERVER_LOG" | sed 's/^/  /'
    
    # Debug: Check if any workbench files exist in build
    if [ -d "$APP_DIR/.agentuity/workbench" ]; then
        error "Debug: Workbench directory exists in build"
        ls -la "$APP_DIR/.agentuity/workbench" | head -5 | sed 's/^/  /'
    else
        error "Debug: No workbench directory in build"
    fi
    
    fail_test "Custom workbench route failed"
fi

# Test default route should return 404
log "Testing default '/workbench' route should return 404..."
DEFAULT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3500/workbench)
if [ "$DEFAULT_STATUS" = "404" ]; then
    log "✓ Default '/workbench' route correctly returns 404 with custom config"
else
    error "✗ Default '/workbench' route should return 404 with custom config"
    error "Expected: 404, Got: $DEFAULT_STATUS"
    fail_test "Default route should be 404 when using custom route"
fi

# Phase 4: Test route conflict detection
log "Phase 4: Testing route conflict detection"

# Kill the dev server for clean restart with conflict scenario
log "Stopping dev server for conflict test..."
if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    sleep 2
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        kill -9 "$SERVER_PID" 2>/dev/null || true
    fi
    lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
fi

# Create a route conflict - workbench and custom route on same path
cat > "$APP_FILE" << 'EOF'
import { createApp } from '@agentuity/runtime';

if (!process.env.AGENTUITY_SDK_KEY) {
	console.error('missing AGENTUITY_SDK_KEY');
	process.exit(1);
}

import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench({
	route: '/random',
	headers: {},
});

const app = createApp({
	services: {
		workbench,
	},
});

app.router.get('/random', (c) => c.text('Hello, world!'));

app.logger.debug('Running %s', app.server.url);
EOF

log "Created route conflict scenario"

# Start server with conflict scenario
log "Starting dev server with route conflict scenario..."
CLI_PATH="$(dirname "$(dirname "$APP_DIR")")/../packages/cli/bin/cli.ts"
bun "$CLI_PATH" dev --no-public < /dev/null > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

log "Conflict test server started (PID: $SERVER_PID)"

# Wait for server to be ready (may have conflicts)
TIMEOUT=30
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if [ -f "$SERVER_LOG" ] && grep -q "DevMode ready" "$SERVER_LOG"; then
        log "Conflict test server is ready!"
        break
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -eq $TIMEOUT ]; then
    fail_test "Conflict test server failed to start within $TIMEOUT seconds"
fi

sleep 3  # Give time for conflicts to be detected

# Check if route conflict was detected (server should log error but continue running)
if grep -q "Route conflict detected" "$SERVER_LOG"; then
    log "✓ Route conflict detected correctly"
else
    error "✗ Route conflict not detected in logs"
    fail_test "Route conflict detection failed"
fi

# Server should still be running after conflict detection

# Phase 5: Restore and verify original config
log "Phase 5: Restoring original workbench configuration"

# Kill the current server and start fresh with original config
log "Stopping conflict test server..."
if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    sleep 2
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        kill -9 "$SERVER_PID" 2>/dev/null || true
    fi
    lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
fi

# Restore original file with git
git -C "$APP_DIR" checkout -- "$APP_FILE"
log "Restored app.ts with git to original state"

# Start fresh dev server with original config
log "Starting fresh dev server with original config..."
CLI_PATH="$(dirname "$(dirname "$APP_DIR")")/../packages/cli/bin/cli.ts"
bun "$CLI_PATH" dev --no-public < /dev/null > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
TIMEOUT=30
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if [ -f "$SERVER_LOG" ] && grep -q "DevMode ready" "$SERVER_LOG"; then
        log "Server is ready after restart!"
        break
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -eq $TIMEOUT ]; then
    fail_test "Server failed to restart within $TIMEOUT seconds"
fi

# Give server extra time to fully initialize with original config
sleep 3

# Test workbench should work again at default route
log "Testing workbench restoration at default route..."
RESTORE_RESPONSE=$(curl -s http://localhost:3500/workbench)
if echo "$RESTORE_RESPONSE" | grep -q "workbench-root"; then
    log "✓ Workbench accessible again at default route after restoration"
else
    error "✗ Workbench not accessible at default route after restoration"
    fail_test "Workbench restoration failed"
fi

log ""
log "✅ All workbench tests passed!"
log "- ✓ Workbench accessible when createWorkbench() present"
log "- ✓ Workbench returns 404 when commented out"
log "- ✓ AST parser correctly ignores commented workbench code"
log "- ✓ Custom route configuration works correctly"
log "- ✓ Default route returns 404 when using custom route"
log "- ✓ Route conflict detection works correctly"
log "- ✓ Workbench restored to original configuration successfully"
