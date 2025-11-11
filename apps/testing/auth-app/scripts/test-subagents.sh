#!/bin/bash

# Subagent Testing Script
# Tests nested agent functionality including parent/child relationships

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "  Subagent Tests"
echo "========================================="
echo ""

# Generate unique test run ID for parallel test execution
TEST_RUN_ID="test-$(date +%s%N)"
echo "Test Run ID: $TEST_RUN_ID"
echo ""

BASE_URL="http://localhost:$PORT"

# Create temporary directory for server logs
TEMP_DIR=$(mktemp -d)

trap cleanup EXIT

# Start server if needed
start_server_if_needed

echo "Step 1: Test Parent Agent - GET /agent/team"
RESPONSE=$(curl -s "$BASE_URL/agent/team")
CURL_EXIT=$?

if [ "$CURL_EXIT" -ne 0 ]; then
	echo -e "${RED}✗ FAIL:${NC} curl command failed with exit code $CURL_EXIT"
	if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
		echo "Server logs (last 50 lines):"
		tail -50 "$LOG_FILE"
	fi
	exit 1
fi

if [ -z "$RESPONSE" ]; then
	echo -e "${RED}✗ FAIL:${NC} Empty response from server"
	if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
		echo "Server logs (last 50 lines):"
		tail -50 "$LOG_FILE"
	fi
	exit 1
fi

if ! echo "$RESPONSE" | jq . > /dev/null 2>&1; then
	echo -e "${RED}✗ FAIL:${NC} Response is not valid JSON"
	echo "Raw response: $RESPONSE"
	if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
		echo "Server logs (last 50 lines):"
		tail -50 "$LOG_FILE"
	fi
	exit 1
fi

echo "$RESPONSE" | jq .
MESSAGE=$(echo "$RESPONSE" | jq -r .message)
if [[ "$MESSAGE" == *"Team parent agent"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Parent agent returns correct message"
else
	echo -e "${RED}✗ FAIL:${NC} Parent agent message incorrect"
	echo "Expected message to contain 'Team parent agent', got: '$MESSAGE'"
	if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
		echo "Server logs (last 50 lines):"
		tail -50 "$LOG_FILE"
	fi
	exit 1
fi
echo ""

echo "Step 2: Test Parent Agent - POST /agent/team"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team" \
	-H "Content-Type: application/json" \
	-d '{"action":"count"}')
echo "$RESPONSE" | jq .
MESSAGE=$(echo "$RESPONSE" | jq -r .message)
if [[ "$MESSAGE" == *"2 subagents"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Parent agent count correct"
else
	echo -e "${RED}✗ FAIL:${NC} Parent agent count incorrect"
	exit 1
fi
echo ""

echo "Step 3: Test Subagent Members - GET /agent/team/members (empty)"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/members" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"list\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
MEMBERS=$(echo "$RESPONSE" | jq -r '.members | length')
if [ "$MEMBERS" -eq 0 ]; then
	echo -e "${GREEN}✓ PASS:${NC} Members list is initially empty"
else
	echo -e "${RED}✗ FAIL:${NC} Members list should be empty"
	exit 1
fi
echo ""

echo "Step 4: Test Add Member - POST /agent/team/members/add"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/members/add" \
	-H "Content-Type: application/json" \
	-d "{\"name\":\"Alice\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
ACTION=$(echo "$RESPONSE" | jq -r .action)
MEMBERS=$(echo "$RESPONSE" | jq -r '.members | length')
if [[ "$ACTION" == *"Added Alice"* ]] && [ "$MEMBERS" -eq 1 ]; then
	echo -e "${GREEN}✓ PASS:${NC} Added Alice successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to add Alice"
	exit 1
fi
echo ""

echo "Step 5: Test Add Another Member"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/members/add" \
	-H "Content-Type: application/json" \
	-d "{\"name\":\"Bob\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
MEMBERS=$(echo "$RESPONSE" | jq -r '.members | length')
HAS_ALICE=$(echo "$RESPONSE" | jq -r '.members | contains(["Alice"])')
HAS_BOB=$(echo "$RESPONSE" | jq -r '.members | contains(["Bob"])')
if [ "$MEMBERS" -eq 2 ] && [ "$HAS_ALICE" = "true" ] && [ "$HAS_BOB" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Added Bob successfully, both members present"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to add Bob correctly"
	exit 1
fi
echo ""

echo "Step 6: Test Parent Context Access"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/members" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"list\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
PARENT_INFO=$(echo "$RESPONSE" | jq -r .parentInfo)
if [[ "$PARENT_INFO" == *"Parent says:"* ]] && [[ "$PARENT_INFO" == *"Team parent agent"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Subagent can access parent via ctx.parent"
else
	echo -e "${RED}✗ FAIL:${NC} Parent context access failed"
	exit 1
fi
echo ""

echo "Step 7: Test Remove Member"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/members/remove" \
	-H "Content-Type: application/json" \
	-d "{\"name\":\"Alice\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
MEMBERS=$(echo "$RESPONSE" | jq -r '.members | length')
HAS_ALICE=$(echo "$RESPONSE" | jq -r '.members | contains(["Alice"])')
HAS_BOB=$(echo "$RESPONSE" | jq -r '.members | contains(["Bob"])')
if [ "$MEMBERS" -eq 1 ] && [ "$HAS_ALICE" = "false" ] && [ "$HAS_BOB" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Removed Alice, Bob remains"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to remove Alice correctly"
	exit 1
fi
echo ""

echo "Step 8: Test Subagent Tasks - GET /agent/team/tasks"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/tasks" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"list\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
AGENT_NAME=$(echo "$RESPONSE" | jq -r .currentAgent)
if [ "$AGENT_NAME" = "team.tasks" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Agent name correct (team.tasks)"
else
	echo -e "${RED}✗ FAIL:${NC} Agent name incorrect"
	exit 1
fi
echo ""

echo "Step 9: Test Add Task"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/tasks/add" \
	-H "Content-Type: application/json" \
	-d "{\"task\":\"Test subagent task\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
ACTION=$(echo "$RESPONSE" | jq -r .action)
if [[ "$ACTION" == *"Added task"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Added task successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to add task"
	exit 1
fi
echo ""

echo "Step 10: Test Add Another Task"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/tasks/add" \
	-H "Content-Type: application/json" \
	-d "{\"task\":\"Another test task\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
ACTION=$(echo "$RESPONSE" | jq -r .action)
if [[ "$ACTION" == *"Added task"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Added second task successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to add second task"
	exit 1
fi
echo ""

echo "Step 11: Test Task Operations Work"
# Get current tasks to find an ID to complete
TASKS_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/tasks" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"list\",\"testRunId\":\"$TEST_RUN_ID\"}")
TASK_ID=$(echo "$TASKS_RESPONSE" | jq -r '.tasks[0].id // 1')

RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/tasks/complete" \
	-H "Content-Type: application/json" \
	-d "{\"id\":\"$TASK_ID\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
ACTION=$(echo "$RESPONSE" | jq -r .action)
if [[ "$ACTION" == *"Completed task"* ]]; then
	echo -e "${GREEN}✓ PASS:${NC} Task completion works"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to complete task"
	exit 1
fi
echo ""

echo "Step 12: Test Direct POST to Members Subagent"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/members" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"add\",\"name\":\"Charlie\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
HAS_CHARLIE=$(echo "$RESPONSE" | jq -r '.members | contains(["Charlie"])')
if [ "$HAS_CHARLIE" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Direct POST to subagent works"
else
	echo -e "${RED}✗ FAIL:${NC} Direct POST to subagent failed"
	exit 1
fi
echo ""

echo "Step 13: Test Direct POST to Tasks Subagent"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/team/tasks" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"add\",\"task\":\"Deploy to production\",\"testRunId\":\"$TEST_RUN_ID\"}")
echo "$RESPONSE" | jq .
TASKS=$(echo "$RESPONSE" | jq -r '.tasks | length')
if [ "$TASKS" -eq 3 ]; then
	echo -e "${GREEN}✓ PASS:${NC} Direct POST to tasks subagent works"
else
	echo -e "${RED}✗ FAIL:${NC} Direct POST to tasks subagent failed"
	exit 1
fi
echo ""

echo "Step 14: Verify Route Patterns"
PARENT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/agent/team")
MEMBERS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/agent/team/members")
TASKS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/agent/team/tasks")

if [ "$PARENT_CODE" = "200" ] && [ "$MEMBERS_CODE" = "200" ] && [ "$TASKS_CODE" = "200" ]; then
	echo -e "${GREEN}✓ PASS:${NC} All route patterns return 200"
else
	echo -e "${RED}✗ FAIL:${NC} Some routes failed (parent:$PARENT_CODE, members:$MEMBERS_CODE, tasks:$TASKS_CODE)"
	exit 1
fi
echo ""

echo "Step 15: Cleanup Test Data"
# Delete test-specific KV keys
curl -s -X POST "$BASE_URL/agent/team/members" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"remove\",\"name\":\"Bob\",\"testRunId\":\"$TEST_RUN_ID\"}" > /dev/null
curl -s -X POST "$BASE_URL/agent/team/members" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"remove\",\"name\":\"Charlie\",\"testRunId\":\"$TEST_RUN_ID\"}" > /dev/null
curl -s -X POST "$BASE_URL/agent/team/tasks" \
	-H "Content-Type: application/json" \
	-d "{\"action\":\"remove\",\"testRunId\":\"$TEST_RUN_ID\"}" > /dev/null
echo -e "${GREEN}✓ PASS:${NC} Cleanup complete"
echo ""

echo "========================================="
echo -e "${GREEN}All Subagent Tests Passed!${NC}"
echo "========================================="
echo ""
echo "Summary:"
echo "  ✓ Parent agent functionality"
echo "  ✓ Subagent nested access (ctx.agent.team.members)"
echo "  ✓ Parent context access (ctx.parent)"
echo "  ✓ Agent name with dot notation (team.members)"
echo "  ✓ Route pattern inheritance"
echo "  ✓ CRUD operations on both subagents"
echo ""
