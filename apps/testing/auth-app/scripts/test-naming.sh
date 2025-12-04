#!/bin/bash

# Test script for agent naming edge cases
# Tests hyphenated names, multi-word names, and parent/child naming

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source test library with error checking
if [ ! -f "$SCRIPT_DIR/test-lib.sh" ]; then
	echo "ERROR: test-lib.sh not found"
	exit 1
fi

source "$SCRIPT_DIR/test-lib.sh" || {
	echo "ERROR: Failed to source test-lib.sh"
	exit 1
}

echo "========================================="
echo "Agent Naming Test"
echo "========================================="
echo ""

PORT="${PORT:-3500}"
echo "[DEBUG] PORT=$PORT"

trap cleanup EXIT

# Start server if needed
echo "[DEBUG] Calling start_server_if_needed"
start_server_if_needed
echo "[DEBUG] Server started/confirmed running"

# Test function
test_agent() {
	local name=$1
	local url=$2
	local data=$3
	
	echo "Testing: $name"
	
	# Capture response and HTTP code (use -H and -d for compatibility with older curl)
	local response=$(curl -s --max-time 10 -w "\n%{http_code}" -X POST "$url" \
		-H "Content-Type: application/json" \
		-d "$data")
	local http_code=$(echo "$response" | tail -n 1)
	local body=$(echo "$response" | sed '$d')
	
	if [ "$http_code" = "200" ]; then
		echo "  ✅ Success"
	else
		echo "  ❌ Failed (HTTP $http_code)"
		echo "  URL: $url"
		echo "  Data: $data"
		echo "  Response: $body"
		TEST_FAILED=true
		return 1
	fi
}

echo "Test 1: Hyphenated agent names (send-email -> sendEmail)..."
test_agent "send-email" \
	"http://localhost:$PORT/agent/send-email" \
	'{"to":"test@example.com","subject":"Test"}'

echo "Test 2: Multi-hyphenated names (my-agent -> myAgent)..."
test_agent "my-agent" \
	"http://localhost:$PORT/agent/my-agent" \
	'{"message":"Hello"}'

echo "Test 3: Multi-word with multiple hyphens (multi-word-test -> multiWordTest)..."
test_agent "multi-word-test" \
	"http://localhost:$PORT/agent/multi-word-test" \
	'{"data":"test data"}'

echo "Test 4: Parent agent with hyphens (notification-service -> notificationService)..."
test_agent "notification-service" \
	"http://localhost:$PORT/agent/notification-service" \
	'{"type":"email"}'

echo "Test 5: Subagent with hyphenated parent and child (notification-service/send-push -> notificationService.sendPush)..."
test_agent "notification-service/send-push" \
	"http://localhost:$PORT/agent/notification-service/send-push" \
	'{"device":"device123","message":"Hello push"}'

echo "Test 6: Existing simple agent (no hyphens)..."
test_agent "simple" \
	"http://localhost:$PORT/agent/simple" \
	'{"name":"Bob","age":30}'

echo ""
echo -e "${GREEN}✓ All naming tests passed!${NC}"
echo ""
