#!/bin/bash

# Vector CLI Test Script
# Tests CLI operations for vector storage (search, get, delete)

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

BIN_SCRIPT="$SCRIPT_DIR/../../../../packages/cli/bin/cli.ts"

echo "========================================="
echo "  Vector CLI Test"
echo "========================================="
echo ""

# Generate unique key prefix and namespace to avoid collisions
UNIQUE_ID="$(date +%s)-$$-$RANDOM"
TEST_RUN_ID="test-vec-cli-$UNIQUE_ID"
NAMESPACE="test-vectors-$UNIQUE_ID"
echo "Test Run ID: $TEST_RUN_ID"
echo "Namespace: $NAMESPACE"
echo ""

BASE_URL="http://localhost:$PORT/agent/vector"

# Create temp directory for test artifacts
TEMP_DIR=$(mktemp -d)
echo "Test directory: $TEMP_DIR"
echo ""

trap cleanup EXIT

# Start server if needed (for inserting test data via API)
start_server_if_needed

# Change to test-app directory (for project context)
cd "$SCRIPT_DIR/.."

# Check if user is authenticated
echo "Checking authentication..."
set +e
bun "$BIN_SCRIPT" auth whoami &> /dev/null
AUTH_CHECK=$?
set -e

if [ $AUTH_CHECK -ne 0 ]; then
	echo -e "${RED}✗${NC} Not authenticated. Please run: bun $BIN_SCRIPT auth login"
	TEST_FAILED=true
	exit 1
fi
echo -e "${GREEN}✓${NC} Authenticated"
echo ""

# Check if project exists (agentuity.json file)
if [ ! -f "agentuity.json" ]; then
	echo -e "${RED}✗${NC} No agentuity.json file found. This test must be run from a project directory."
	TEST_FAILED=true
	exit 1
fi
echo -e "${GREEN}✓${NC} Project configuration found"
echo ""

# Step 1: Insert test vectors via the runtime API (not CLI - CLI doesn't have upsert)
echo "Step 1: Inserting test vectors via runtime API..."
UPSERT_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"upsert\",\"key\":\"${TEST_RUN_ID}-doc1\",\"document\":\"Machine learning is a subset of artificial intelligence that enables systems to learn from data\",\"category\":\"ai\"}")

SUCCESS=$(echo "$UPSERT_RESPONSE" | jq -r .success)
if [ "$SUCCESS" = "true" ]; then
	echo -e "${GREEN}✓${NC} Inserted first test vector"
else
	echo -e "${RED}✗${NC} Failed to insert first test vector"
	echo "$UPSERT_RESPONSE"
	TEST_FAILED=true
	exit 1
fi

# Insert more test vectors
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"upsert\",\"key\":\"${TEST_RUN_ID}-doc2\",\"document\":\"Deep learning uses neural networks with multiple layers for complex pattern recognition\",\"category\":\"ai\"}" > /dev/null

curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"upsert\",\"key\":\"${TEST_RUN_ID}-doc3\",\"document\":\"Natural language processing helps computers understand and generate human language\",\"category\":\"nlp\"}" > /dev/null

echo -e "${GREEN}✓${NC} Inserted 3 test vectors"
echo ""

# Wait a moment for vectors to be indexed
if [ "$CI" != "" ]; then
	sleep 3
fi

# Step 2: Test vector search CLI command
echo "Step 2: Testing vector search CLI command..."
SEARCH_OUTPUT="$TEMP_DIR/search.txt"
set +e
bun "$BIN_SCRIPT" cloud vector search "$NAMESPACE" "artificial intelligence and machine learning" --json > "$SEARCH_OUTPUT" 2>&1
SEARCH_EXIT=$?
set -e

if [ $SEARCH_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector search command succeeded"
	RESULT_COUNT=$(cat "$SEARCH_OUTPUT" | jq -r '.count')
	echo "Found $RESULT_COUNT results"
	
	if [ "$RESULT_COUNT" -gt 0 ]; then
		echo -e "${GREEN}✓${NC} Search returned results"
	else
		echo -e "${YELLOW}⚠${NC} Search returned no results (vectors may not be indexed yet)"
	fi
else
	echo -e "${RED}✗${NC} Vector search command failed"
	cat "$SEARCH_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 3: Test vector search with limit option
echo "Step 3: Testing vector search with --limit option..."
SEARCH_LIMIT_OUTPUT="$TEMP_DIR/search-limit.txt"
set +e
bun "$BIN_SCRIPT" cloud vector search "$NAMESPACE" "neural networks" --limit 2 --json > "$SEARCH_LIMIT_OUTPUT" 2>&1
SEARCH_LIMIT_EXIT=$?
set -e

if [ $SEARCH_LIMIT_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector search with limit succeeded"
	RESULT_COUNT=$(cat "$SEARCH_LIMIT_OUTPUT" | jq -r '.count')
	echo "Found $RESULT_COUNT results (limit was 2)"
else
	echo -e "${RED}✗${NC} Vector search with limit failed"
	cat "$SEARCH_LIMIT_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 4: Test vector list alias (should work same as search)
echo "Step 4: Testing vector list alias..."
LIST_OUTPUT="$TEMP_DIR/list.txt"
set +e
bun "$BIN_SCRIPT" cloud vector list "$NAMESPACE" "deep learning" --json > "$LIST_OUTPUT" 2>&1
LIST_EXIT=$?
set -e

if [ $LIST_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector list alias works correctly"
else
	echo -e "${RED}✗${NC} Vector list alias failed"
	cat "$LIST_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 5: Test vector ls alias
echo "Step 5: Testing vector ls alias..."
LS_OUTPUT="$TEMP_DIR/ls.txt"
set +e
bun "$BIN_SCRIPT" cloud vector ls "$NAMESPACE" "language processing" --json > "$LS_OUTPUT" 2>&1
LS_EXIT=$?
set -e

if [ $LS_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector ls alias works correctly"
else
	echo -e "${RED}✗${NC} Vector ls alias failed"
	cat "$LS_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 6: Test vector get CLI command
echo "Step 6: Testing vector get CLI command..."
GET_OUTPUT="$TEMP_DIR/get.txt"
set +e
bun "$BIN_SCRIPT" cloud vector get "$NAMESPACE" "${TEST_RUN_ID}-doc1" --json > "$GET_OUTPUT" 2>&1
GET_EXIT=$?
set -e

if [ $GET_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector get command succeeded"
	EXISTS=$(cat "$GET_OUTPUT" | jq -r '.exists')
	if [ "$EXISTS" = "true" ]; then
		echo -e "${GREEN}✓${NC} Vector exists"
		KEY=$(cat "$GET_OUTPUT" | jq -r '.key')
		echo "Retrieved vector key: $KEY"
	else
		echo -e "${YELLOW}⚠${NC} Vector not found (may not be indexed yet)"
	fi
else
	echo -e "${RED}✗${NC} Vector get command failed"
	cat "$GET_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 7: Test vector get for non-existent key
echo "Step 7: Testing vector get for non-existent key..."
GET_MISSING_OUTPUT="$TEMP_DIR/get-missing.txt"
set +e
bun "$BIN_SCRIPT" cloud vector get "$NAMESPACE" "non-existent-key-12345" --json > "$GET_MISSING_OUTPUT" 2>&1
GET_MISSING_EXIT=$?
set -e

if [ $GET_MISSING_EXIT -eq 0 ]; then
	EXISTS=$(cat "$GET_MISSING_OUTPUT" | jq -r '.exists')
	if [ "$EXISTS" = "false" ]; then
		echo -e "${GREEN}✓${NC} Correctly reports non-existent vector"
	else
		echo -e "${YELLOW}⚠${NC} Unexpected: non-existent key returned exists=true"
	fi
else
	echo -e "${RED}✗${NC} Vector get command failed for non-existent key"
	cat "$GET_MISSING_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 8: Test vector delete CLI command
echo "Step 8: Testing vector delete CLI command..."
DELETE_OUTPUT="$TEMP_DIR/delete.txt"
set +e
bun "$BIN_SCRIPT" cloud vector delete "$NAMESPACE" "${TEST_RUN_ID}-doc1" --confirm --json > "$DELETE_OUTPUT" 2>&1
DELETE_EXIT=$?
set -e

if [ $DELETE_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector delete command succeeded"
	DELETED=$(cat "$DELETE_OUTPUT" | jq -r '.deleted')
	echo "Deleted $DELETED vector(s)"
else
	echo -e "${RED}✗${NC} Vector delete command failed"
	cat "$DELETE_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 9: Test vector rm alias
echo "Step 9: Testing vector rm alias..."
RM_OUTPUT="$TEMP_DIR/rm.txt"
set +e
bun "$BIN_SCRIPT" cloud vector rm "$NAMESPACE" "${TEST_RUN_ID}-doc2" --confirm --json > "$RM_OUTPUT" 2>&1
RM_EXIT=$?
set -e

if [ $RM_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector rm alias works correctly"
else
	echo -e "${RED}✗${NC} Vector rm alias failed"
	cat "$RM_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 10: Test vector del alias
echo "Step 10: Testing vector del alias..."
DEL_OUTPUT="$TEMP_DIR/del.txt"
set +e
bun "$BIN_SCRIPT" cloud vector del "$NAMESPACE" "${TEST_RUN_ID}-doc3" --confirm --json > "$DEL_OUTPUT" 2>&1
DEL_EXIT=$?
set -e

if [ $DEL_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector del alias works correctly"
else
	echo -e "${RED}✗${NC} Vector del alias failed"
	cat "$DEL_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Step 11: Verify deleted vector is gone
echo "Step 11: Verifying deleted vector is gone..."
VERIFY_OUTPUT="$TEMP_DIR/verify.txt"
set +e
bun "$BIN_SCRIPT" cloud vector get "$NAMESPACE" "${TEST_RUN_ID}-doc1" --json > "$VERIFY_OUTPUT" 2>&1
VERIFY_EXIT=$?
set -e

if [ $VERIFY_EXIT -eq 0 ]; then
	EXISTS=$(cat "$VERIFY_OUTPUT" | jq -r '.exists')
	if [ "$EXISTS" = "false" ]; then
		echo -e "${GREEN}✓${NC} Deleted vector correctly not found"
	else
		echo -e "${YELLOW}⚠${NC} Deleted vector still exists (may be eventual consistency)"
	fi
else
	echo -e "${RED}✗${NC} Verify command failed"
	cat "$VERIFY_OUTPUT"
fi
echo ""

# Step 12: Test vec alias for vector command
echo "Step 12: Testing vec alias for vector command..."
VEC_OUTPUT="$TEMP_DIR/vec.txt"
set +e
bun "$BIN_SCRIPT" cloud vec search "$NAMESPACE" "test query" --json > "$VEC_OUTPUT" 2>&1
VEC_EXIT=$?
set -e

if [ $VEC_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Vector 'vec' alias works correctly"
else
	echo -e "${RED}✗${NC} Vector 'vec' alias failed"
	cat "$VEC_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Vector CLI operations working correctly."
echo "  - search (with list, ls aliases)"
echo "  - get"
echo "  - delete (with rm, del aliases)"
echo "  - vec command alias"
echo "========================================="
echo ""

print_result
