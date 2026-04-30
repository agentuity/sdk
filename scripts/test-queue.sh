#!/bin/bash
# Test Queue CLI Commands
# Exercises create, publish, receive, ack/nack, destinations, DLQ, and delete functionality
#
# This script validates actual command outputs, not just exit codes.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="bun $SDK_ROOT/packages/cli/src/main.ts"

# Get commit SHA for queue descriptions
COMMIT_SHA=$(git -C "$SDK_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
QUEUE_DESC="Automated test-queue.sh for commit $COMMIT_SHA"
QUEUE_NAME=""
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleanup() {
	echo -e "\n${YELLOW}Cleaning up...${NC}"
	if [ -n "$QUEUE_NAME" ]; then
		$CLI cloud queue delete "$QUEUE_NAME" --confirm 2>/dev/null || true
	fi
	echo -e "${GREEN}Cleanup complete${NC}"
	echo ""
	echo "========================================"
	echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
	echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
	echo "========================================"
	if [ $TESTS_FAILED -gt 0 ]; then
		exit 1
	fi
}

trap cleanup EXIT

pass() {
	echo -e "${GREEN}✓ $1${NC}"
	TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
	echo -e "${RED}✗ $1${NC}"
	echo -e "${RED}  Output: $2${NC}"
	if [ -n "$QUEUE_NAME" ]; then
		echo -e "${RED}  Queue: $QUEUE_NAME${NC}"
	fi
	TESTS_FAILED=$((TESTS_FAILED + 1))
}

info() {
	echo -e "${YELLOW}→ $1${NC}"
}

section() {
	echo ""
	echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	echo -e "${YELLOW}  $1${NC}"
	echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

echo "========================================"
echo "  Queue CLI Test Suite"
echo "========================================"

# ============================================
section "LIST Command Tests (Empty)"
# ============================================

# Test: List queues (should be empty or show existing)
info "Test: queue list"
LIST_OUTPUT=$($CLI cloud queue list --json 2>&1) || true
if echo "$LIST_OUTPUT" | grep -q '"queues"'; then
	pass "queue list returns queues array"
else
	fail "queue list did not return expected format" "$LIST_OUTPUT"
fi

# ============================================
section "CREATE Command Tests"
# ============================================

# Generate unique queue name
QUEUE_NAME="test_queue_$(date +%s)"

# Test: Create worker queue
info "Test: queue create worker"
CREATE_OUTPUT=$($CLI cloud queue create worker --name "$QUEUE_NAME" --description "$QUEUE_DESC" --json 2>&1) || true
if echo "$CREATE_OUTPUT" | grep -q "\"name\".*\"$QUEUE_NAME\""; then
	pass "queue create returns queue with correct name"
else
	fail "queue create did not return expected queue" "$CREATE_OUTPUT"
	exit 1  # Can't continue without queue
fi

# Verify queue type
if echo "$CREATE_OUTPUT" | grep -q '"queue_type".*"worker"'; then
	pass "queue create returns correct queue type"
else
	fail "queue create did not return worker type" "$CREATE_OUTPUT"
fi

# ============================================
section "GET Command Tests"
# ============================================

# Test: Get queue info
info "Test: queue get"
GET_OUTPUT=$($CLI cloud queue get "$QUEUE_NAME" --json 2>&1) || true
if echo "$GET_OUTPUT" | grep -q "\"name\".*\"$QUEUE_NAME\""; then
	pass "queue get returns correct queue"
else
	fail "queue get did not return expected queue" "$GET_OUTPUT"
fi

# ============================================
section "LIST Command Tests (With Queue)"
# ============================================

# Test: List queues includes our queue
info "Test: queue list includes created queue"
LIST_OUTPUT=$($CLI cloud queue list --json 2>&1) || true
if echo "$LIST_OUTPUT" | grep -q "$QUEUE_NAME"; then
	pass "queue list includes created queue"
else
	fail "queue list did not include created queue" "$LIST_OUTPUT"
fi

# ============================================
section "PUBLISH Command Tests"
# ============================================

# Test: Publish a simple message
info "Test: queue publish simple message"
PUBLISH_OUTPUT=$($CLI cloud queue publish "$QUEUE_NAME" '{"task":"test1"}' --json 2>&1) || true
if echo "$PUBLISH_OUTPUT" | grep -q '"id".*"qmsg_'; then
	pass "queue publish returns message ID"
else
	fail "queue publish did not return message ID" "$PUBLISH_OUTPUT"
fi

# Test: Publish with metadata
info "Test: queue publish with metadata"
PUBLISH_META_OUTPUT=$($CLI cloud queue publish "$QUEUE_NAME" '{"task":"test2"}' --metadata '{"priority":"high"}' --json 2>&1) || true
if echo "$PUBLISH_META_OUTPUT" | grep -q '"id".*"qmsg_'; then
	pass "queue publish with metadata succeeds"
else
	fail "queue publish with metadata failed" "$PUBLISH_META_OUTPUT"
fi

# Test: Publish with idempotency key
info "Test: queue publish with idempotency key"
IDEM_KEY="test-idem-$(date +%s)"
PUBLISH_IDEM_OUTPUT=$($CLI cloud queue publish "$QUEUE_NAME" '{"task":"test3"}' --idempotency-key "$IDEM_KEY" --json 2>&1) || true
if echo "$PUBLISH_IDEM_OUTPUT" | grep -q '"id".*"qmsg_'; then
	pass "queue publish with idempotency key succeeds"
else
	fail "queue publish with idempotency key failed" "$PUBLISH_IDEM_OUTPUT"
fi

# ============================================
section "MESSAGES Command Tests"
# ============================================

# Test: List messages
info "Test: queue messages list"
MESSAGES_OUTPUT=$($CLI cloud queue messages "$QUEUE_NAME" --json 2>&1) || true
if echo "$MESSAGES_OUTPUT" | grep -q '"messages"'; then
	pass "queue messages returns messages array"
else
	fail "queue messages did not return expected format" "$MESSAGES_OUTPUT"
fi

# Check we have at least 3 messages
MSG_COUNT=$(echo "$MESSAGES_OUTPUT" | grep -o '"id".*"qmsg_' | wc -l)
if [ "$MSG_COUNT" -ge 3 ]; then
	pass "queue has at least 3 messages"
else
	fail "queue should have at least 3 messages, found $MSG_COUNT" "$MESSAGES_OUTPUT"
fi

# ============================================
section "RECEIVE & ACK Command Tests"
# ============================================

# Test: Receive a message
info "Test: queue receive"
RECEIVE_OUTPUT=$($CLI cloud queue receive "$QUEUE_NAME" --json 2>&1) || true
if echo "$RECEIVE_OUTPUT" | grep -q '"id".*"qmsg_'; then
	RECEIVED_ID=$(echo "$RECEIVE_OUTPUT" | grep -o '"id":"qmsg_[^"]*"' | head -1 | sed 's/"id":"//;s/"$//')
	pass "queue receive returns message: $RECEIVED_ID"
else
	fail "queue receive did not return a message" "$RECEIVE_OUTPUT"
	RECEIVED_ID=""
fi

# Test: Acknowledge the message
if [ -n "$RECEIVED_ID" ]; then
	info "Test: queue ack"
	ACK_OUTPUT=$($CLI cloud queue ack "$QUEUE_NAME" "$RECEIVED_ID" 2>&1)
	ACK_STATUS=$?
	if echo "$ACK_OUTPUT" | grep -qi "acknowledged\|success" || [ "$ACK_STATUS" -eq 0 ]; then
		pass "queue ack succeeds"
	else
		fail "queue ack failed" "$ACK_OUTPUT"
	fi
fi

# ============================================
section "RECEIVE & NACK Command Tests"
# ============================================

# Test: Receive another message
info "Test: queue receive for nack test"
RECEIVE_OUTPUT2=$($CLI cloud queue receive "$QUEUE_NAME" --json 2>&1) || true
if echo "$RECEIVE_OUTPUT2" | grep -q '"id".*"qmsg_'; then
	RECEIVED_ID2=$(echo "$RECEIVE_OUTPUT2" | grep -o '"id":"qmsg_[^"]*"' | head -1 | sed 's/"id":"//;s/"$//')
	pass "queue receive returns message: $RECEIVED_ID2"
else
	fail "queue receive did not return a message" "$RECEIVE_OUTPUT2"
	RECEIVED_ID2=""
fi

# Test: Negative acknowledge the message
if [ -n "$RECEIVED_ID2" ]; then
	info "Test: queue nack"
	NACK_OUTPUT=$($CLI cloud queue nack "$QUEUE_NAME" "$RECEIVED_ID2" 2>&1)
	NACK_STATUS=$?
	if echo "$NACK_OUTPUT" | grep -qi "returned\|success\|nack" || [ "$NACK_STATUS" -eq 0 ]; then
		pass "queue nack succeeds"
	else
		fail "queue nack failed" "$NACK_OUTPUT"
	fi
fi

# ============================================
section "DESTINATION Command Tests"
# ============================================

# Test: Create destination
info "Test: queue destinations create"
DEST_OUTPUT=$($CLI cloud queue destinations create "$QUEUE_NAME" --url "https://httpbin.org/post" --name "test-destination" --json 2>&1) || true
if echo "$DEST_OUTPUT" | grep -q '"id".*"qdest_'; then
	DEST_ID=$(echo "$DEST_OUTPUT" | tr -d '\n ' | grep -o '"id":"qdest_[^"]*"' | sed 's/"id":"//;s/"$//')
	pass "queue destinations create returns destination ID: $DEST_ID"
else
	fail "queue destinations create failed" "$DEST_OUTPUT"
	DEST_ID=""
fi

# Test: List destinations
info "Test: queue destinations list"
DEST_LIST_OUTPUT=$($CLI cloud queue destinations list "$QUEUE_NAME" --json 2>&1) || true
if echo "$DEST_LIST_OUTPUT" | grep -q '"destinations"'; then
	pass "queue destinations list returns destinations array"
else
	fail "queue destinations list failed" "$DEST_LIST_OUTPUT"
fi

# Test: Update destination
if [ -n "$DEST_ID" ]; then
	info "Test: queue destinations update"
	DEST_UPDATE_OUTPUT=$($CLI cloud queue destinations update "$QUEUE_NAME" "$DEST_ID" --disabled --json 2>&1) || true
	if echo "$DEST_UPDATE_OUTPUT" | grep -q '"enabled".*false'; then
		pass "queue destinations update succeeds"
	else
		fail "queue destinations update failed" "$DEST_UPDATE_OUTPUT"
	fi
fi

# Test: Delete destination
if [ -n "$DEST_ID" ]; then
	info "Test: queue destinations delete"
	DEST_DELETE_OUTPUT=$($CLI cloud queue destinations delete "$QUEUE_NAME" "$DEST_ID" 2>&1)
	DEST_DELETE_STATUS=$?
	if echo "$DEST_DELETE_OUTPUT" | grep -qi "deleted\|success" || [ "$DEST_DELETE_STATUS" -eq 0 ]; then
		pass "queue destinations delete succeeds"
	else
		fail "queue destinations delete failed" "$DEST_DELETE_OUTPUT"
	fi
fi

# ============================================
section "SOURCE Command Tests"
# ============================================

# Test: Create source
info "Test: queue sources create"
SOURCE_OUTPUT=$($CLI cloud queue sources create "$QUEUE_NAME" --name "test-source-1" --auth-type none --json 2>&1) || true
if echo "$SOURCE_OUTPUT" | grep -q '"id"'; then
	# Extract ID and URL from multiline JSON output (handle spaces after colons)
	SOURCE_ID=$(echo "$SOURCE_OUTPUT" | tr -d '\n ' | grep -o '"id":"qsrc_[^"]*"' | sed 's/"id":"//;s/"$//')
	SOURCE_URL=$(echo "$SOURCE_OUTPUT" | tr -d '\n ' | grep -o '"url":"[^"]*"' | sed 's/"url":"//;s/"$//')
	pass "queue sources create returns source ID: $SOURCE_ID"
else
	fail "queue sources create failed" "$SOURCE_OUTPUT"
	SOURCE_ID=""
	SOURCE_URL=""
fi

# Test: List sources
info "Test: queue sources list"
SOURCE_LIST_OUTPUT=$($CLI cloud queue sources list "$QUEUE_NAME" --json 2>&1) || true
if echo "$SOURCE_LIST_OUTPUT" | grep -q '"sources"'; then
	pass "queue sources list returns sources array"
else
	fail "queue sources list failed" "$SOURCE_LIST_OUTPUT"
fi

# Test: Get source
if [ -n "$SOURCE_ID" ]; then
	info "Test: queue sources get"
	SOURCE_GET_OUTPUT=$($CLI cloud queue sources get "$QUEUE_NAME" "$SOURCE_ID" --json 2>&1) || true
	if echo "$SOURCE_GET_OUTPUT" | grep -q "\"id\".*\"$SOURCE_ID\""; then
		pass "queue sources get returns correct source"
	else
		fail "queue sources get failed" "$SOURCE_GET_OUTPUT"
	fi
fi

# Test: Publish via source URL (HTTP ingest)
if [ -n "$SOURCE_URL" ]; then
	info "Test: queue sources ingest via URL"
	# Get current message count (handle JSON with spaces)
	BEFORE_COUNT=$($CLI cloud queue messages "$QUEUE_NAME" --json 2>&1 | tr -d '\n ' | grep -o '"total":[0-9]*' | sed 's/"total"://')
	BEFORE_COUNT=${BEFORE_COUNT:-0}
	
	# POST to the source URL
	INGEST_OUTPUT=$(curl -s -X POST "$SOURCE_URL" \
		-H "Content-Type: application/json" \
		-d '{"source":"http_ingest_test","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' 2>&1) || true
	
	# Response format: {"data":{"message_id":"qmsg_xxx","offset":0},"success":true}
	if echo "$INGEST_OUTPUT" | grep -q '"message_id".*"qmsg_'; then
		INGEST_MSG_ID=$(echo "$INGEST_OUTPUT" | grep -o '"message_id":"qmsg_[^"]*"' | sed 's/"message_id":"//;s/"$//')
		pass "queue sources ingest returns message ID: $INGEST_MSG_ID"
		
		# Verify message count increased
		sleep 1  # Brief pause for message to be indexed
		AFTER_COUNT=$($CLI cloud queue messages "$QUEUE_NAME" --json 2>&1 | tr -d '\n ' | grep -o '"total":[0-9]*' | sed 's/"total"://')
		AFTER_COUNT=${AFTER_COUNT:-0}
		if [ "$AFTER_COUNT" -gt "$BEFORE_COUNT" ]; then
			pass "queue sources ingest message appears in queue (count: $BEFORE_COUNT -> $AFTER_COUNT)"
		else
			fail "queue sources ingest message not in queue" "Before: $BEFORE_COUNT, After: $AFTER_COUNT"
		fi
	else
		fail "queue sources ingest failed" "$INGEST_OUTPUT"
	fi
else
	fail "queue sources ingest skipped - no SOURCE_URL" "SOURCE_OUTPUT: $SOURCE_OUTPUT"
fi

# Test: Update source
if [ -n "$SOURCE_ID" ]; then
	info "Test: queue sources update"
	SOURCE_UPDATE_OUTPUT=$($CLI cloud queue sources update "$QUEUE_NAME" "$SOURCE_ID" --disabled --json 2>&1) || true
	if echo "$SOURCE_UPDATE_OUTPUT" | grep -q '"enabled".*false'; then
		pass "queue sources update succeeds"
	else
		fail "queue sources update failed" "$SOURCE_UPDATE_OUTPUT"
	fi
fi

# Test: Delete source
if [ -n "$SOURCE_ID" ]; then
	info "Test: queue sources delete"
	SOURCE_DELETE_OUTPUT=$($CLI cloud queue sources delete "$QUEUE_NAME" "$SOURCE_ID" 2>&1) || true
	if echo "$SOURCE_DELETE_OUTPUT" | grep -qi "deleted\|success" || [ $? -eq 0 ]; then
		pass "queue sources delete succeeds"
	else
		fail "queue sources delete failed" "$SOURCE_DELETE_OUTPUT"
	fi
fi

# ============================================
section "STATS Command Tests"
# ============================================

# Test: Org-level stats
info "Test: queue stats (org-level)"
STATS_ORG_OUTPUT=$($CLI cloud queue stats --json 2>&1) || true
if echo "$STATS_ORG_OUTPUT" | tr -d '\n ' | grep -q '"type":"org"'; then
	pass "queue stats returns org-level analytics"
else
	fail "queue stats (org-level) failed" "$STATS_ORG_OUTPUT"
fi

# Test: Queue-specific stats
info "Test: queue stats (queue-level)"
STATS_QUEUE_OUTPUT=$($CLI cloud queue stats "$QUEUE_NAME" --json 2>&1) || true
if echo "$STATS_QUEUE_OUTPUT" | tr -d '\n ' | grep -q '"type":"queue"'; then
	pass "queue stats returns queue-level analytics"
else
	fail "queue stats (queue-level) failed" "$STATS_QUEUE_OUTPUT"
fi

# ============================================
section "PAUSE/RESUME Command Tests"
# ============================================

# Test: Pause queue
info "Test: queue pause"
PAUSE_OUTPUT=$($CLI cloud queue pause "$QUEUE_NAME" --json 2>&1) || true
if echo "$PAUSE_OUTPUT" | grep -q '"paused_at"'; then
	pass "queue pause succeeds"
else
	fail "queue pause failed" "$PAUSE_OUTPUT"
fi

# Test: Resume queue
info "Test: queue resume"
RESUME_OUTPUT=$($CLI cloud queue resume "$QUEUE_NAME" --json 2>&1) || true
if echo "$RESUME_OUTPUT" | grep -q '"name"'; then
	pass "queue resume succeeds"
else
	fail "queue resume failed" "$RESUME_OUTPUT"
fi

# ============================================
section "DLQ Command Tests"
# ============================================

# Note: To properly test DLQ, we would need to force message failures
# For now, we just test that the commands work

# Test: List DLQ messages (should be empty)
info "Test: queue dlq list"
DLQ_LIST_OUTPUT=$($CLI cloud queue dlq list "$QUEUE_NAME" --json 2>&1) || true
if echo "$DLQ_LIST_OUTPUT" | grep -q '"messages"'; then
	pass "queue dlq list returns messages array"
else
	fail "queue dlq list failed" "$DLQ_LIST_OUTPUT"
fi

# Test: Purge DLQ (should succeed even if empty)
info "Test: queue dlq purge"
DLQ_PURGE_OUTPUT=$($CLI cloud queue dlq purge "$QUEUE_NAME" --confirm 2>&1)
DLQ_PURGE_STATUS=$?
if echo "$DLQ_PURGE_OUTPUT" | grep -qi "purged\|success\|cleared" || [ "$DLQ_PURGE_STATUS" -eq 0 ]; then
	pass "queue dlq purge succeeds"
else
	fail "queue dlq purge failed" "$DLQ_PURGE_OUTPUT"
fi

# ============================================
section "DELETE Command Tests"
# ============================================

# Test: Delete queue
info "Test: queue delete"
DELETED_QUEUE="$QUEUE_NAME"
DELETE_OUTPUT=$($CLI cloud queue delete "$QUEUE_NAME" --confirm 2>&1)
DELETE_STATUS=$?
if echo "$DELETE_OUTPUT" | grep -qi "deleted\|success" || [ "$DELETE_STATUS" -eq 0 ]; then
	pass "queue delete succeeds"
	QUEUE_NAME=""
else
	fail "queue delete failed" "$DELETE_OUTPUT"
fi

# Verify queue no longer accessible
if [ -z "$QUEUE_NAME" ] && [ -n "$DELETED_QUEUE" ]; then
	info "Test: deleted queue not accessible"
	GONE_OUTPUT=$($CLI cloud queue get "$DELETED_QUEUE" 2>&1) || true
	if echo "$GONE_OUTPUT" | grep -qi "not found\|404\|error"; then
		pass "deleted queue returns not found"
	else
		fail "deleted queue still accessible" "$GONE_OUTPUT"
	fi
fi

# ============================================
section "PUBSUB Queue Type Tests"
# ============================================

# Test: Create pubsub queue
PUBSUB_QUEUE_NAME="test_pubsub_$(date +%s)"
info "Test: queue create pubsub"
PUBSUB_CREATE_OUTPUT=$($CLI cloud queue create pubsub --name "$PUBSUB_QUEUE_NAME" --description "$QUEUE_DESC" --json 2>&1) || true
if echo "$PUBSUB_CREATE_OUTPUT" | grep -q '"queue_type".*"pubsub"'; then
	pass "queue create pubsub returns correct type"
else
	fail "queue create pubsub failed" "$PUBSUB_CREATE_OUTPUT"
fi

# Test: Publish to pubsub queue
info "Test: queue publish to pubsub"
PUBSUB_PUBLISH_OUTPUT=$($CLI cloud queue publish "$PUBSUB_QUEUE_NAME" '{"event":"test"}' --json 2>&1) || true
if echo "$PUBSUB_PUBLISH_OUTPUT" | grep -q '"id".*"qmsg_'; then
	pass "queue publish to pubsub succeeds"
else
	fail "queue publish to pubsub failed" "$PUBSUB_PUBLISH_OUTPUT"
fi

# Cleanup pubsub queue
$CLI cloud queue delete "$PUBSUB_QUEUE_NAME" --confirm 2>/dev/null || true

echo ""
echo -e "${GREEN}All queue tests completed!${NC}"
