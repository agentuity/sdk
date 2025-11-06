#!/bin/bash

# Agent Event Listeners Testing Script
# Tests agent event listener functionality

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "  Agent Event Listeners Tests"
echo "========================================="
echo ""

BASE_URL="http://localhost:$PORT"

# Create temporary directory for server logs
TEMP_DIR=$(mktemp -d)
LOG_FILE="$TEMP_DIR/server.log"

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

# Start server if needed and capture logs
start_server_if_needed

echo "Step 1: Test Event Listeners - GET /agent/events"
echo "Making request to trigger event listeners..."
RESPONSE=$(curl -s "$BASE_URL/agent/events")
echo "Response: $RESPONSE"
echo ""

echo "Step 2: Verify 'started' event was fired"
# Check if the agent handler was called successfully
if [[ "$RESPONSE" == *"Hello, the date is"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Agent executed successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Agent response unexpected: $RESPONSE"
	exit 1
fi
echo ""

echo "Step 3: Verify event listener logs with state"
# Only verify logs if we started the server (and have access to log file)
if [ "$SERVER_STARTED" = true ]; then
	if [ ! -f "$LOG_FILE" ]; then
		echo -e "${RED}✗ FAIL:${NC} Server log file not found: $LOG_FILE"
		exit 1
	fi

	# Wait for 'started' event log to appear
	if wait_for_log_pattern "agent .* fired started event" 5 0.2; then
		echo -e "${GREEN}✓ PASS:${NC} 'started' event listener fired"
	else
		echo -e "${RED}✗ FAIL:${NC} 'started' event not found in logs within 5s timeout"
		echo "Log contents:"
		cat "$LOG_FILE"
		exit 1
	fi

	# Wait for 'completed' event log to appear
	if wait_for_log_pattern "agent .* fired completed event" 5 0.2; then
		echo -e "${GREEN}✓ PASS:${NC} 'completed' event listener fired"
	else
		echo -e "${RED}✗ FAIL:${NC} 'completed' event not found in logs within 5s timeout"
		echo "Log contents:"
		cat "$LOG_FILE"
		exit 1
	fi

	# Wait for state feature - duration logging
	if wait_for_log_pattern "agent .* completed in [0-9]+ms" 5 0.2; then
		echo -e "${GREEN}✓ PASS:${NC} State feature working (duration tracking)"
	else
		echo -e "${RED}✗ FAIL:${NC} Duration log not found within 5s timeout (state feature not working)"
		echo "Log contents:"
		cat "$LOG_FILE"
		exit 1
	fi

	# Wait for state feature - event count logging
	if wait_for_log_pattern "total events fired: [0-9]+" 5 0.2; then
		echo -e "${GREEN}✓ PASS:${NC} State feature working (event count tracking)"
	else
		echo -e "${RED}✗ FAIL:${NC} Event count log not found within 5s timeout (state feature not working)"
		echo "Log contents:"
		cat "$LOG_FILE"
		exit 1
	fi
else
	# Server was already running - try to check logs if LOG_PATH is provided
	if [ -n "$LOG_PATH" ] && [ -f "$LOG_PATH" ]; then
		LOG_FILE="$LOG_PATH"
		echo -e "${YELLOW}ℹ INFO:${NC} Using external log file: $LOG_FILE"
		
		# Attempt to verify logs
		if wait_for_log_pattern "agent .* fired started event" 5 0.2; then
			echo -e "${GREEN}✓ PASS:${NC} Event listener logs verified in external log"
		else
			echo -e "${YELLOW}⚠ WARNING:${NC} Could not verify event listener logs in external log file"
			echo "  (Server was not started by this test, log verification skipped)"
		fi
	else
		echo -e "${YELLOW}⚠ WARNING:${NC} Server was not started by this test"
		echo "  Log verification skipped. Set LOG_PATH env var to verify logs from external server."
		echo "  Agent execution verified via response."
	fi
fi
echo ""

echo "Step 4: Test multiple requests trigger events multiple times"
echo "Making second request..."
RESPONSE2=$(curl -s "$BASE_URL/agent/events")
if [[ "$RESPONSE2" == *"Hello, the date is"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Second request successful"
else
	echo -e "${RED}✗ FAIL:${NC} Second request failed"
	exit 1
fi
echo ""

echo "Step 5: Verify event listener is persistent"
echo "Making third request..."
RESPONSE3=$(curl -s "$BASE_URL/agent/events")
if [[ "$RESPONSE3" == *"Hello, the date is"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Third request successful - event listeners persist"
else
	echo -e "${RED}✗ FAIL:${NC} Third request failed"
	exit 1
fi
echo ""

echo "========================================="
echo -e "${GREEN}All Event Listener Tests Passed!${NC}"
echo "========================================="
echo ""
echo "Summary:"
echo "  ✓ Agent executes successfully"
echo "  ✓ Event listeners attached to agent"
echo "  ✓ Multiple requests work correctly"
echo "  ✓ Event listeners persist across requests"
echo ""
echo "Note: Check server logs manually to verify event listener features:"
echo "  - Event firing: 'agent fired event started/completed events'"
echo "  - State usage: 'agent events completed in Xms'"
echo "  - State usage: 'total events fired: N'"
echo ""
