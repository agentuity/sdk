#!/bin/bash

# State Persistence Test Script
# Tests thread and session state persistence via WebSocket and API

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "State Persistence Test"
echo "========================================="
echo ""

PORT="${PORT:-3500}"
BASE_URL="http://localhost:$PORT/agent/state"
CLI_PATH="${CLI_PATH:-../../../packages/cli/bin/cli.ts}"

trap cleanup EXIT

# Start server if needed
start_server_if_needed

# Generate unique test data
TEST_THREAD_DATA="thread-data-$(date +%s%N)"
TEST_SESSION_DATA="session-data-$(date +%s%N)"

echo "Test Data:"
echo "  Thread: $TEST_THREAD_DATA"
echo "  Session: $TEST_SESSION_DATA"
echo ""

# Step 1: Save data to thread and session state
echo "Step 1: Saving data to thread and session state..."
SAVE_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -c /tmp/cookies.txt \
  -d "{\"action\":\"save\",\"threadData\":\"$TEST_THREAD_DATA\",\"sessionData\":\"$TEST_SESSION_DATA\"}")

echo "$SAVE_RESPONSE" | jq .
SUCCESS=$(echo "$SAVE_RESPONSE" | jq -r .success)
THREAD_ID=$(cat /tmp/cookies.txt 2>/dev/null | grep atid | awk '{print $7}')

if [ -z "$THREAD_ID" ]; then
	echo -e "${YELLOW}⚠ WARNING:${NC} Could not extract thread ID from cookies"
	THREAD_ID=""
fi

if [ "$SUCCESS" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Save operation successful"
	echo "  Thread ID: $THREAD_ID"
else
	echo -e "${RED}✗ FAIL:${NC} Save operation failed"
	exit 1
fi
echo ""

# Step 2: Wait a moment for async save to complete
echo "Step 2: Waiting for async persistence..."
sleep 2
echo -e "${GREEN}✓${NC} Wait complete"
echo ""

# Step 3: Make a second request with same thread cookie (should restore thread state)
echo "Step 3: Making second request with same thread..."
READ_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d "{\"action\":\"read\"}")

echo "$READ_RESPONSE" | jq .
SUCCESS=$(echo "$READ_RESPONSE" | jq -r .success)
THREAD_DATA=$(echo "$READ_RESPONSE" | jq -r '.threadState.testData // empty')
REQUEST_COUNT=$(echo "$READ_RESPONSE" | jq -r '.threadState.requestCount // 0')

if [ "$SUCCESS" = "true" ] && [ "$THREAD_DATA" = "$TEST_THREAD_DATA" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Thread state persisted and restored correctly"
	echo "  Thread Data: $THREAD_DATA"
	echo "  Request Count: $REQUEST_COUNT"
else
	echo -e "${RED}✗ FAIL:${NC} Thread state not restored"
	echo "  Expected: $TEST_THREAD_DATA"
	echo "  Got: $THREAD_DATA"
	exit 1
fi
echo ""

# Step 4: Verify session state is empty in new request (shouldn't persist across requests)
SESSION_DATA_IN_NEW_REQUEST=$(echo "$READ_RESPONSE" | jq -r '.sessionState.sessionData // "empty"')
if [ "$SESSION_DATA_IN_NEW_REQUEST" = "empty" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Session state correctly scoped to single request"
else
	echo -e "${RED}✗ FAIL:${NC} Session state incorrectly persisted across requests"
	exit 1
fi
echo ""

# Step 5: Verify thread state via CLI
echo "Step 5: Verifying thread state via CLI..."

if [ -z "$THREAD_ID" ]; then
	echo -e "${RED}✗ FAIL:${NC} Thread ID not available"
	exit 1
fi

CLI_RESPONSE=$(timeout 5 $CLI_PATH cloud thread get "$THREAD_ID" --json 2>&1 || echo '{"error":"timeout"}')

if ! echo "$CLI_RESPONSE" | jq . > /dev/null 2>&1; then
	echo -e "${RED}✗ FAIL:${NC} CLI command failed or returned invalid JSON"
	echo "$CLI_RESPONSE"
	exit 1
fi

CLI_USER_DATA=$(echo "$CLI_RESPONSE" | jq -r '.user_data // "empty"')

if [ "$CLI_USER_DATA" = "empty" ] || [ -z "$CLI_USER_DATA" ]; then
	echo -e "${RED}✗ FAIL:${NC} Thread user_data not found in CLI response"
	exit 1
fi

# Parse the user_data JSON
CLI_TEST_DATA=$(echo "$CLI_USER_DATA" | jq -r '.testData // "empty"')
CLI_REQUEST_COUNT=$(echo "$CLI_USER_DATA" | jq -r '.requestCount // 0')

if [ "$CLI_TEST_DATA" = "empty" ]; then
	echo -e "${RED}✗ FAIL:${NC} testData not found in CLI user_data"
	exit 1
fi

if [ "$CLI_TEST_DATA" != "$TEST_THREAD_DATA" ]; then
	echo -e "${RED}✗ FAIL:${NC} Thread data mismatch in CLI"
	echo "  Expected: '$TEST_THREAD_DATA'"
	echo "  Got: '$CLI_TEST_DATA'"
	exit 1
fi

echo -e "${GREEN}✓ PASS:${NC} Thread state verified via CLI"
echo "  Thread ID: $THREAD_ID"
echo "  Test Data: $CLI_TEST_DATA"
echo "  Request Count: $CLI_REQUEST_COUNT"
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "State persistence working correctly:"
echo "  ✓ Thread state persists across requests"
echo "  ✓ Session state scoped to single request"
echo "  ✓ Data serialization and restoration working"
echo "========================================="
echo ""

print_result
