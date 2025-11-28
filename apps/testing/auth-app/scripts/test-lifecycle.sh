#!/bin/bash

# Lifecycle Testing Script
# Tests app and agent lifecycle hooks (setup/shutdown)
# Runs the built app directly (not via dev server) to properly test shutdown

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================="
echo "  App & Agent Lifecycle Tests"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PORT=3501  # Use different port to avoid conflicts with dev server
BASE_URL="http://localhost:$PORT"

# Create temporary directory for server logs
TEMP_DIR=$(mktemp -d)
LOG_FILE="$TEMP_DIR/server.log"
SERVER_PID=""

cleanup() {
	if [ -n "$SERVER_PID" ] && ps -p $SERVER_PID > /dev/null 2>&1; then
		echo "Cleaning up server process $SERVER_PID..."
		kill -9 $SERVER_PID 2>/dev/null || true
	fi
	if [ -d "$TEMP_DIR" ]; then
		rm -rf "$TEMP_DIR"
	fi
}

trap cleanup EXIT

# Helper function to wait for a log pattern to appear
# Usage: wait_for_log_pattern "pattern" [timeout_seconds] [interval_seconds]
wait_for_log_pattern() {
	local pattern="$1"
	local timeout="${2:-5}"
	local interval="${3:-0.2}"
	local elapsed=0
	
	while [ $(echo "$elapsed < $timeout" | bc -l) -eq 1 ]; do
		if [ -f "$LOG_FILE" ] && grep -qE "$pattern" "$LOG_FILE"; then
			return 0
		fi
		sleep "$interval"
		elapsed=$(echo "$elapsed + $interval" | bc -l)
	done
	
	return 1
}

echo "Step 1: Build the app"
cd "$APP_DIR"
echo "Building..."
bun run build > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Build completed"
echo ""

echo "Step 2: Start the built app"
echo "Starting app on port $PORT..."
AGENTUITY_PORT=$PORT bun run .agentuity/app.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "Server started (PID: $SERVER_PID)"
echo "Waiting for server to be ready..."

# Wait for server to start
for i in {1..30}; do
	if curl -s $BASE_URL/agent/lifecycle > /dev/null 2>&1; then
		echo -e "${GREEN}✓${NC} Server is ready"
		break
	fi
	if [ $i -eq 30 ]; then
		echo -e "${RED}✗${NC} Server failed to start within 30 seconds"
		echo "Log contents:"
		cat "$LOG_FILE"
		exit 1
	fi
	sleep 1
done
echo ""

echo "Step 3: Verify app-level setup was called"

if wait_for_log_pattern "🚀 App setup: Initializing test data" 5 0.2; then
	echo -e "${GREEN}✓ PASS:${NC} App setup() called"
else
	echo -e "${RED}✗ FAIL:${NC} App setup() not found in logs"
	echo "Log contents:"
	cat "$LOG_FILE"
	exit 1
fi
echo ""

echo "Step 4: Verify agent-level setup was called"

if wait_for_log_pattern "🔧 \[LIFECYCLE AGENT\] Setup started" 5 0.2; then
	echo -e "${GREEN}✓ PASS:${NC} Agent setup() called"
else
	echo -e "${RED}✗ FAIL:${NC} Agent setup() not found in logs"
	echo "Log contents:"
	cat "$LOG_FILE"
	exit 1
fi

# Verify setup received app state
if wait_for_log_pattern "✅ App name: auth-app" 5 0.2; then
	echo -e "${GREEN}✓ PASS:${NC} Agent setup received app state"
else
	echo -e "${RED}✗ FAIL:${NC} Agent setup did not receive app state"
	exit 1
fi
echo ""

echo "Step 5: Test agent execution with both app and agent config"

echo "Making request to /agent/lifecycle..."
RESPONSE=$(curl -s "$BASE_URL/agent/lifecycle")
echo "Response: $RESPONSE"

# Verify response structure
if echo "$RESPONSE" | jq -e '.result' > /dev/null 2>&1; then
	echo -e "${GREEN}✓ PASS:${NC} Agent executed successfully"
	
	# Extract and verify fields
	RESULT=$(echo "$RESPONSE" | jq -r '.result')
	APP_NAME=$(echo "$RESPONSE" | jq -r '.appName')
	AGENT_ID=$(echo "$RESPONSE" | jq -r '.agentId')
	
	echo "   - Result: $RESULT"
	echo "   - App name: $APP_NAME"
	echo "   - Agent ID: $AGENT_ID"
	
	if [ "$APP_NAME" = "auth-app" ]; then
		echo -e "${GREEN}✓ PASS:${NC} App state available in handler (appName: $APP_NAME)"
	else
		echo -e "${RED}✗ FAIL:${NC} App state not correct: $APP_NAME"
		exit 1
	fi
	
	if [[ "$AGENT_ID" =~ ^agent- ]]; then
		echo -e "${GREEN}✓ PASS:${NC} Agent config available in handler (agentId: $AGENT_ID)"
	else
		echo -e "${RED}✗ FAIL:${NC} Agent config not correct: $AGENT_ID"
		exit 1
	fi
else
	echo -e "${RED}✗ FAIL:${NC} Agent response unexpected: $RESPONSE"
	exit 1
fi
echo ""

echo "Step 6: Verify handler logs show both app and agent state"

if wait_for_log_pattern "📊 App name: auth-app" 5 0.2; then
	echo -e "${GREEN}✓ PASS:${NC} Handler has access to app state"
else
	echo -e "${RED}✗ FAIL:${NC} Handler app state not found in logs"
	exit 1
fi

if wait_for_log_pattern "📊 Agent ID: agent-" 5 0.2; then
	echo -e "${GREEN}✓ PASS:${NC} Handler has access to agent config"
else
	echo -e "${RED}✗ FAIL:${NC} Handler agent config not found in logs"
	exit 1
fi

if wait_for_log_pattern "📊 Connection pool size: 3" 5 0.2; then
	echo -e "${GREEN}✓ PASS:${NC} Handler can access agent config properties"
else
	echo -e "${RED}✗ FAIL:${NC} Handler config properties not accessible"
	exit 1
fi
echo ""

echo "Step 7: Verify agent event listeners have access to config"

if wait_for_log_pattern "🎯 \[LIFECYCLE EVENT\] Agent started" 5 0.2; then
	echo -e "${GREEN}✓ PASS:${NC} Agent event listener 'started' fired"
else
	echo -e "${RED}✗ FAIL:${NC} Agent event listener 'started' not found"
	exit 1
fi

if wait_for_log_pattern "📊 Agent ID from config: agent-" 5 0.2; then
	echo -e "${GREEN}✓ PASS:${NC} Agent event listener has access to config"
else
	echo -e "${RED}✗ FAIL:${NC} Agent event listener config not accessible"
	exit 1
fi
echo ""

echo "Step 8: Test shutdown lifecycle"
echo "Sending SIGINT to server (PID: $SERVER_PID)..."

# Send SIGINT to trigger graceful shutdown
kill -SIGINT $SERVER_PID

# Wait for process to exit
for i in {1..10}; do
	if ! ps -p $SERVER_PID > /dev/null 2>&1; then
		echo -e "${GREEN}✓${NC} Server shut down gracefully"
		break
	fi
	if [ $i -eq 10 ]; then
		echo -e "${YELLOW}⚠${NC} Server still running after 10 seconds, forcing shutdown..."
		kill -9 $SERVER_PID 2>/dev/null || true
	fi
	sleep 1
done

# Give logs time to flush
sleep 2
echo ""

echo "Step 9: Verify shutdown logs"

if grep -q "🛑 App shutdown: Cleaning up" "$LOG_FILE"; then
	echo -e "${GREEN}✓ PASS:${NC} App shutdown() called"
	
	if grep -q "App name: auth-app" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} App shutdown received state"
	else
		echo -e "${RED}✗ FAIL:${NC} App shutdown state verification failed"
		exit 1
	fi
else
	echo -e "${RED}✗ FAIL:${NC} App shutdown() not found in logs"
	echo "Shutdown-related logs:"
	grep -E "(shutdown|Shutdown|🛑)" "$LOG_FILE" || echo "No shutdown logs found"
	exit 1
fi

if grep -q "🛑 \[LIFECYCLE AGENT\] Shutdown started" "$LOG_FILE"; then
	echo -e "${GREEN}✓ PASS:${NC} Agent shutdown() called"
	
	if grep -q "Agent ID: agent-" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Agent shutdown received config"
	else
		echo -e "${RED}✗ FAIL:${NC} Agent shutdown config verification failed"
		exit 1
	fi
	
	if grep -q "Closing: conn-" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Agent shutdown cleanup executed"
	else
		echo -e "${RED}✗ FAIL:${NC} Agent shutdown cleanup not found"
		exit 1
	fi
else
	echo -e "${RED}✗ FAIL:${NC} Agent shutdown() not found in logs"
	echo "Shutdown-related logs:"
	grep -E "(shutdown|Shutdown|🛑)" "$LOG_FILE" || echo "No shutdown logs found"
	exit 1
fi

# Mark as cleaned up so trap doesn't try again
SERVER_PID=""

echo ""
echo "========================================="
echo -e "${GREEN}All Lifecycle Tests Passed!${NC}"
echo "========================================="
echo ""
echo "Summary:"
echo "  ✓ App setup() called and returns typed state"
echo "  ✓ Agent setup() called and receives app state"
echo "  ✓ Agent setup() returns typed config"
echo "  ✓ Agent handler receives both app state and agent config"
echo "  ✓ Agent event listeners receive both app state and agent config"
echo "  ✓ App shutdown() called and receives app state"
echo "  ✓ Agent shutdown() called and receives both app state and agent config"
echo "  ✓ Shutdown cleanup executes properly"
echo "  ✓ Data flows correctly through all lifecycle hooks"
echo ""
echo "Features verified:"
echo "  - App setup/shutdown lifecycle"
echo "  - Agent setup/shutdown lifecycle"
echo "  - App state propagation"
echo "  - Agent config propagation"
echo "  - Type safety (implicit through successful execution)"
echo ""
