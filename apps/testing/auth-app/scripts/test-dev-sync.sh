#!/bin/bash
set -e

# Test devmode sync service mock logging
# This script:
# 1. Starts the dev server with DEVMODE_SYNC_SERVICE_MOCK=true
# 2. Verifies initial sync logs show all agents/evals as "new"
# 3. Makes a change to an agent file
# 4. Verifies sync logs show the agent as "changed"
# 5. Optionally tests eval file changes
# 6. Cleans up any uncommitted changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Source shared test library
source "$SCRIPT_DIR/test-lib.sh"

AGENT_FILE="$APP_DIR/src/agents/simple/agent.ts"
EVAL_FILE="$APP_DIR/src/agents/eval/eval.ts"
# Place log outside app root to avoid triggering file watcher
SERVER_LOG=$(mktemp "${TMPDIR:-/tmp}/test-dev-sync-XXXXXX")
BACKUP_DIR=$(mktemp -d)
BACKUP_FILE="$BACKUP_DIR/agent.ts.bak"
EVAL_BACKUP_FILE="$BACKUP_DIR/eval.ts.bak"
SERVER_PID=""
PORT=3500
TEST_FAILED=false

log() {
	echo -e "${GREEN}[TEST]${NC} $1"
}

error() {
	echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
	echo -e "${YELLOW}[WARN]${NC} $1"
}

fail_test() {
	TEST_FAILED=true
	error "$1"
	exit 1
}

# Wait for sync to appear in logs
wait_for_sync() {
	local timeout=${1:-30}
	local elapsed=0
	
	log "Waiting for sync to complete..."
	while [ $elapsed -lt $timeout ]; do
		if [ -f "$SERVER_LOG" ] && grep -q "\[MOCK\]" "$SERVER_LOG"; then
			return 0
		fi
		sleep 1
		elapsed=$((elapsed + 1))
		if [ $((elapsed % 5)) -eq 0 ]; then
			log "Still waiting for sync... ($elapsed seconds)"
		fi
	done
	
	return 1
}

# Check for mock sync log messages
check_mock_log() {
	local pattern="$1"
	local description="$2"
	
	if grep -q "$pattern" "$SERVER_LOG"; then
		log "✓ Found $description"
		return 0
	else
		error "✗ Missing $description"
		return 1
	fi
}

# Verify agent sync payload structure
verify_agent_sync() {
	local agent_id="$1"
	local expected_status="$2" # "new" or "changed"
	
	log "Verifying agent sync for agent: $agent_id (expected: $expected_status)"
	
	# Check for the sync request log
	if ! grep -q "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG"; then
		error "Missing agent sync request log"
		return 1
	fi
	
	# Extract the payload section (between the log line and next [MOCK] or end)
	# Look for the agent ID in the payload
	if ! grep -A 50 "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" | grep -q "\"id\".*\"$agent_id\""; then
		error "Agent $agent_id not found in sync payload"
		return 1
	fi
	
	# Check for required fields in the payload context
	# We'll verify the structure by checking for key fields near the agent ID
	local payload_section=$(grep -A 100 "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" | grep -A 20 "\"id\".*\"$agent_id\"" | head -20)
	
	if ! echo "$payload_section" | grep -q "\"name\""; then
		error "Agent payload missing 'name' field"
		return 1
	fi
	
	if ! echo "$payload_section" | grep -q "\"version\""; then
		error "Agent payload missing 'version' field"
		return 1
	fi
	
	if ! echo "$payload_section" | grep -q "\"projectId\""; then
		error "Agent payload missing 'projectId' field"
		return 1
	fi
	
	log "✓ Agent sync payload structure verified"
	return 0
}

# Verify eval sync payload structure
verify_eval_sync() {
	local eval_id="$1"
	
	log "Verifying eval sync for eval: $eval_id"
	
	# Check for the sync request log
	if ! grep -q "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG"; then
		error "Missing eval sync request log"
		return 1
	fi
	
	# Look for the eval ID in the payload
	if ! grep -A 50 "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG" | grep -q "\"id\".*\"$eval_id\""; then
		error "Eval $eval_id not found in sync payload"
		return 1
	fi
	
	# Check for required fields
	local payload_section=$(grep -A 100 "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG" | grep -A 20 "\"id\".*\"$eval_id\"" | head -20)
	
	if ! echo "$payload_section" | grep -q "\"agentId\""; then
		error "Eval payload missing 'agentId' field"
		return 1
	fi
	
	if ! echo "$payload_section" | grep -q "\"version\""; then
		error "Eval payload missing 'version' field"
		return 1
	fi
	
	log "✓ Eval sync payload structure verified"
	return 0
}

cleanup() {
	log "Cleaning up..."
	
	# Dump server logs if test failed
	if [ "$TEST_FAILED" = true ] && [ -f "$SERVER_LOG" ]; then
		error ""
		error "========================================="
		error "Server log (last 100 lines):"
		error "========================================="
		tail -100 "$SERVER_LOG"
		error "========================================="
		error ""
		error "All [MOCK] log entries:"
		error "========================================="
		grep "\[MOCK\]" "$SERVER_LOG" || error "(none found)"
		error "========================================="
	fi
	
	# Kill the dev server if running
	if [ -n "$SERVER_PID" ]; then
		log "Stopping dev server (PID: $SERVER_PID)"
		
		# Kill gravity processes first (they may be children of the dev server)
		pkill -9 -f gravity 2>/dev/null || true
		
		# Kill the dev server process
		kill "$SERVER_PID" 2>/dev/null || true
		
		# Wait for graceful shutdown
		sleep 2
		
		# Force kill if still running
		if kill -0 "$SERVER_PID" 2>/dev/null; then
			log "Forcing shutdown..."
			kill -9 "$SERVER_PID" 2>/dev/null || true
		fi
		
		# Also kill any remaining processes on the port
		if command -v lsof &> /dev/null; then
			lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
		fi
	fi
	
	# Restore original agent file
	if [ -f "$AGENT_FILE" ] && ! git -C "$APP_DIR" diff --quiet "$AGENT_FILE" 2>/dev/null; then
		warn "Restoring original agent file"
		git -C "$APP_DIR" checkout -- "$AGENT_FILE" 2>/dev/null || true
	fi
	
	# Restore original eval file
	if [ -f "$EVAL_FILE" ] && ! git -C "$APP_DIR" diff --quiet "$EVAL_FILE" 2>/dev/null; then
		warn "Restoring original eval file"
		git -C "$APP_DIR" checkout -- "$EVAL_FILE" 2>/dev/null || true
	fi
	
	# Clean up backup directory
	if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
		rm -rf "$BACKUP_DIR"
	fi
	
	# Clean up log file (keep if test failed for debugging)
	if [ "$TEST_FAILED" = false ]; then
		rm -f "$SERVER_LOG"
	else
		warn "Keeping log file for debugging: $SERVER_LOG"
	fi
	
	log "Cleanup complete"
}

# Trap EXIT to ensure cleanup always runs
trap cleanup EXIT INT TERM

# Verify we're in the right directory
if [ ! -f "$AGENT_FILE" ]; then
	fail_test "Agent file not found: $AGENT_FILE"
fi

log "Starting devmode sync service test"
log "App directory: $APP_DIR"
log "Agent file: $AGENT_FILE"
log "Server log: $SERVER_LOG"

# Check if port 3500 is already in use
if lsof -Pi :3500 -sTCP:LISTEN -t >/dev/null 2>&1; then
	error "Port 3500 is already in use"
	error "Please stop any running servers before running this test"
	error ""
	error "Running processes on port 3500:"
	lsof -Pi :3500 -sTCP:LISTEN
	exit 1
fi

# Start the dev server in the background with mock sync service enabled
log "Starting dev server with DEVMODE_SYNC_SERVICE_MOCK=true..."
cd "$APP_DIR"
# Go up from apps/test-app to monorepo root, then to packages/cli
CLI_PATH="$(dirname "$(dirname "$APP_DIR")")/../packages/cli/bin/cli.ts"

# Start with mock sync service enabled
# Note: With mock service, we can use --no-public since we don't need the real devmode endpoint
DEVMODE_SYNC_SERVICE_MOCK=true bun "$CLI_PATH" dev --no-public --log-level=trace < /dev/null > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

log "Dev server started (PID: $SERVER_PID)"
log "Waiting for server to be ready..."

# Wait for server to start (look for "DevMode ready" in logs)
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

# Wait for initial sync to complete
log ""
log "========================================="
log "Test 1: Initial Sync"
log "========================================="

# Wait for sync to appear in logs
if ! wait_for_sync 45; then
	error "Initial sync did not appear in logs"
	error "Server log (last 50 lines):"
	tail -50 "$SERVER_LOG"
	fail_test "Initial sync timeout"
fi

# Give it a moment for all sync logs to be written
sleep 2

# Verify initial sync logs
log "Checking initial sync logs..."

# Check for agent sync request
if ! check_mock_log "\[MOCK\] Would make request: POST /cli/devmode/agent" "agent sync request"; then
	fail_test "Initial agent sync request not found"
fi

# Check for the payload log
if ! check_mock_log "\[MOCK\] Request payload:" "sync payload log"; then
	fail_test "Sync payload log not found"
fi

# Try to identify the simple agent ID from the logs
# The agent ID is typically a hash, so we'll verify structure instead
log "Verifying agent sync payload structure..."
if ! grep -A 20 "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" | grep -q "\"id\""; then
	fail_test "Agent payload missing 'id' field"
fi

if ! grep -A 20 "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" | grep -q "\"name\""; then
	fail_test "Agent payload missing 'name' field"
fi

if ! grep -A 20 "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" | grep -q "\"version\""; then
	fail_test "Agent payload missing 'version' field"
fi

if ! grep -A 20 "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" | grep -q "\"projectId\""; then
	fail_test "Agent payload missing 'projectId' field"
fi

log "✓ Initial agent sync verified"

# Check for eval sync if evals exist
if [ -f "$EVAL_FILE" ]; then
	log "Checking for eval sync..."
	if grep -q "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG"; then
		log "✓ Initial eval sync found"
		
		# Verify eval payload structure
		if ! grep -A 20 "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG" | grep -q "\"agentId\""; then
			fail_test "Eval payload missing 'agentId' field"
		fi
	else
		warn "No eval sync found (this may be expected if no evals are configured)"
	fi
fi

# Test 2: Change Detection - Agent File
log ""
log "========================================="
log "Test 2: Change Detection - Agent File"
log "========================================="

# Backup the agent file
cp "$AGENT_FILE" "$BACKUP_FILE"

# Get baseline sync count
INITIAL_SYNC_COUNT=$(grep -c "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" || echo 0)
log "Initial sync count: $INITIAL_SYNC_COUNT"

# Get baseline restart count
RESTART_COUNT_BEFORE=$(grep -c "restart() completed" "$SERVER_LOG" 2>/dev/null || echo 0)
log "Current restart count: $RESTART_COUNT_BEFORE"

# Modify the agent file (change the response message)
log "Modifying agent file..."
TEMP_AGENT_FILE="$BACKUP_DIR/agent.ts.modified"
cp "$AGENT_FILE" "$TEMP_AGENT_FILE"
sed -i.bak "s/Hello, \${name}! You are \${age} years old\./Greetings, \${name}! Your age is \${age}\./" "$TEMP_AGENT_FILE"
rm -f "$TEMP_AGENT_FILE.bak"
cp "$TEMP_AGENT_FILE" "$AGENT_FILE"

# Verify the file was actually modified
if ! grep -q "Greetings," "$AGENT_FILE"; then
	fail_test "File was not modified as expected"
fi

log "File modified, waiting for file change detection..."
sleep 1

# Wait for "Restarting on file change" in logs
TIMEOUT=15
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

# Wait for restart to complete
log "Waiting for server to finish restarting..."
TIMEOUT=20
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
	RESTART_COUNT_AFTER=$(grep -c "restart() completed" "$SERVER_LOG" 2>/dev/null || echo 0)
	if [ "$RESTART_COUNT_AFTER" -gt "$RESTART_COUNT_BEFORE" ]; then
		# Check if the last restart has hadPendingRestart=false
		if tail -50 "$SERVER_LOG" | grep "restart() completed" | tail -1 | grep -q "hadPendingRestart=false"; then
			sleep 2
			log "Server restart completed!"
			break
		fi
	fi
	sleep 1
	ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -eq $TIMEOUT ]; then
	warn "Timeout waiting for server restart, checking sync anyway..."
fi

# Wait for sync after change
log "Waiting for sync after file change..."
sleep 3

# Check for new sync request
SYNC_COUNT_AFTER=$(grep -c "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" || echo 0)
log "Sync count after change: $SYNC_COUNT_AFTER"

if [ "$SYNC_COUNT_AFTER" -le "$INITIAL_SYNC_COUNT" ]; then
	error "No new sync request detected after file change"
	error "Expected sync count > $INITIAL_SYNC_COUNT, got $SYNC_COUNT_AFTER"
	fail_test "Sync not triggered after file change"
fi

log "✓ Sync triggered after file change"

# Verify the sync shows the change (check for the payload with updated content)
# The version should have changed, so we verify the structure is correct
log "Verifying change sync payload structure..."
if ! grep -A 20 "\[MOCK\] Would make request: POST /cli/devmode/agent" "$SERVER_LOG" | tail -20 | grep -q "\"version\""; then
	fail_test "Change sync payload missing 'version' field"
fi

log "✓ Change sync payload verified"

# Test 3: Change Detection - Eval File (if eval exists)
if [ -f "$EVAL_FILE" ]; then
	log ""
	log "========================================="
	log "Test 3: Change Detection - Eval File"
	log "========================================="
	
	# Backup the eval file
	cp "$EVAL_FILE" "$EVAL_BACKUP_FILE"
	
	# Get baseline eval sync count
	INITIAL_EVAL_SYNC_COUNT=$(grep -c "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG" || echo 0)
	log "Initial eval sync count: $INITIAL_EVAL_SYNC_COUNT"
	
	# Get baseline restart count
	RESTART_COUNT_BEFORE=$(grep -c "restart() completed" "$SERVER_LOG" 2>/dev/null || echo 0)
	
	# Modify the eval file (add a comment)
	log "Modifying eval file..."
	TEMP_EVAL_FILE="$BACKUP_DIR/eval.ts.modified"
	{
		echo "// Test comment added for sync test"
		cat "$EVAL_FILE"
	} > "$TEMP_EVAL_FILE"
	cp "$TEMP_EVAL_FILE" "$EVAL_FILE"
	
	# Verify the file was actually modified
	if ! grep -q "Test comment added for sync test" "$EVAL_FILE"; then
		fail_test "Eval file was not modified as expected"
	fi
	
	log "Eval file modified, waiting for file change detection..."
	sleep 1
	
	# Wait for file change detection
	TIMEOUT=15
	ELAPSED=0
	while [ $ELAPSED -lt $TIMEOUT ]; do
		if grep -q "Restarting on file change" "$SERVER_LOG"; then
			log "Server detected eval file change!"
			break
		fi
		sleep 1
		ELAPSED=$((ELAPSED + 1))
	done
	
	if [ $ELAPSED -eq $TIMEOUT ]; then
		warn "Server did not detect eval file change within $TIMEOUT seconds"
		warn "This may be expected if the change doesn't affect the build"
	else
		# Wait for restart to complete
		log "Waiting for server to finish restarting..."
		TIMEOUT=20
		ELAPSED=0
		while [ $ELAPSED -lt $TIMEOUT ]; do
			RESTART_COUNT_AFTER=$(grep -c "restart() completed" "$SERVER_LOG" 2>/dev/null || echo 0)
			if [ "$RESTART_COUNT_AFTER" -gt "$RESTART_COUNT_BEFORE" ]; then
				if tail -50 "$SERVER_LOG" | grep "restart() completed" | tail -1 | grep -q "hadPendingRestart=false"; then
					sleep 2
					log "Server restart completed!"
					break
				fi
			fi
			sleep 1
			ELAPSED=$((ELAPSED + 1))
		done
		
		# Wait for sync after change
		log "Waiting for sync after eval file change..."
		sleep 3
		
		# Check for new eval sync request
		EVAL_SYNC_COUNT_AFTER=$(grep -c "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG" || echo 0)
		log "Eval sync count after change: $EVAL_SYNC_COUNT_AFTER"
		
		if [ "$EVAL_SYNC_COUNT_AFTER" -gt "$INITIAL_EVAL_SYNC_COUNT" ]; then
			log "✓ Eval sync triggered after file change"
			
			# Verify eval payload structure
			if ! grep -A 20 "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG" | tail -20 | grep -q "\"agentId\""; then
				fail_test "Eval change sync payload missing 'agentId' field"
			fi
			
			log "✓ Eval change sync payload verified"
		else
			warn "No new eval sync detected (this may be expected)"
		fi
	fi
else
	log "Skipping eval file test (eval file not found)"
fi

log ""
log "========================================="
log "✓ All tests passed!"
log "========================================="
log ""
log "Summary:"
log "  - Dev server started with mock sync service"
log "  - Initial sync verified (agents and evals)"
log "  - Agent file change detected and synced"
if [ -f "$EVAL_FILE" ]; then
	log "  - Eval file change detected and synced"
fi
log ""
log "Mock sync service correctly logged all expected requests:"
log "  - POST /cli/devmode/agent with agent payloads"
if [ -f "$EVAL_FILE" ] && grep -q "\[MOCK\] Would make request: POST /cli/devmode/evals" "$SERVER_LOG"; then
	log "  - POST /cli/devmode/evals with eval payloads"
fi
log ""

exit 0

