#!/bin/bash

# Vector Storage Test Script
# Tests vector storage operations including upsert, get, search, and delete

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Vector Storage Test"
echo "========================================="
echo ""

# Generate unique key prefix for this test run to avoid collisions in concurrent tests
TEST_RUN_ID="test-$(date +%s%N)"
echo "Test Run ID: $TEST_RUN_ID"
echo ""

PORT="${PORT:-3500}"
BASE_URL="http://localhost:$PORT/agent/vector"

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)

trap cleanup EXIT

# Start server if needed
start_server_if_needed

# Step 1: Upsert a vector document
echo "Step 1: Upserting vector document..."
UPSERT_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"upsert\",\"key\":\"${TEST_RUN_ID}-doc1\",\"document\":\"Machine learning is a subset of artificial intelligence\",\"category\":\"ai\"}")

if echo "$UPSERT_RESPONSE" | jq . > /dev/null 2>&1; then
	echo "$UPSERT_RESPONSE" | jq .
	SUCCESS=$(echo "$UPSERT_RESPONSE" | jq -r .success)
	if [ "$SUCCESS" = "true" ]; then
		echo -e "${GREEN}✓ PASS:${NC} Upsert operation successful"
	else
		echo -e "${RED}✗ FAIL:${NC} Upsert operation failed"
		exit 1
	fi
else
	echo "Error: Non-JSON response:"
	echo "$UPSERT_RESPONSE"
	exit 1
fi
echo ""

# Step 2: Upsert more documents for search testing
echo "Step 2: Upserting additional documents..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"upsert\",\"key\":\"${TEST_RUN_ID}-doc2\",\"document\":\"Deep learning uses neural networks with multiple layers\",\"category\":\"ai\"}" > /dev/null

curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"upsert\",\"key\":\"${TEST_RUN_ID}-doc3\",\"document\":\"Natural language processing helps computers understand human language\",\"category\":\"nlp\"}" > /dev/null

curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"upsert\",\"key\":\"${TEST_RUN_ID}-doc4\",\"document\":\"Computer vision enables machines to interpret visual information\",\"category\":\"cv\"}" > /dev/null

echo -e "${GREEN}✓${NC} Inserted 3 additional documents"
echo ""

if [ "$CI" != "" ];
then
	sleep 3
fi

# Step 3: Get a specific vector by key
echo "Step 3: Getting vector by key..."
GET_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"get\",\"key\":\"${TEST_RUN_ID}-doc1\"}")

# Don't print the full response with large embedding array, just extract what we need
SUCCESS=$(echo "$GET_RESPONSE" | jq -r .success)
RESULT_KEY=$(echo "$GET_RESPONSE" | jq -r '.result.key')
echo "Response: success=$SUCCESS, key=$RESULT_KEY"

if [ "$SUCCESS" = "true" ] && [ "$RESULT_KEY" = "${TEST_RUN_ID}-doc1" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Get operation successful"
else
	echo -e "${RED}✗ FAIL:${NC} Get operation failed"
	exit 1
fi
echo ""

# Step 4: Get multiple vectors
echo "Step 4: Getting multiple vectors..."
GETMANY_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"getMany\",\"keys\":[\"${TEST_RUN_ID}-doc1\",\"${TEST_RUN_ID}-doc2\",\"${TEST_RUN_ID}-doc3\"]}")

# Don't print the full response with large embedding arrays, just extract what we need
SUCCESS=$(echo "$GETMANY_RESPONSE" | jq -r .success)
COUNT=$(echo "$GETMANY_RESPONSE" | jq -r '.result.count')
echo "Response: success=$SUCCESS, count=$COUNT"

if [ "$SUCCESS" = "true" ] && [ "$COUNT" = "3" ]; then
	echo -e "${GREEN}✓ PASS:${NC} GetMany operation successful, retrieved $COUNT documents"
else
	echo -e "${RED}✗ FAIL:${NC} GetMany operation failed or count mismatch"
	exit 1
fi
echo ""

# Step 5: Semantic search
echo "Step 5: Performing semantic search..."
SEARCH_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"operation":"search","query":"What is AI and neural networks?"}')

# Don't print the full response with large embedding arrays, just extract what we need
SUCCESS=$(echo "$SEARCH_RESPONSE" | jq -r .success)
RESULT_COUNT=$(echo "$SEARCH_RESPONSE" | jq -r '.result.count')
echo "Response: success=$SUCCESS, count=$RESULT_COUNT"

if [ "$SUCCESS" = "true" ] && [ "$RESULT_COUNT" -gt 0 ]; then
	echo -e "${GREEN}✓ PASS:${NC} Search operation successful, found $RESULT_COUNT results"
else
	echo -e "${RED}✗ FAIL:${NC} Search operation failed or no results found"
	exit 1
fi
echo ""

# Step 6: Search with category filter
echo "Step 6: Searching with category filter..."
FILTERED_SEARCH=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"operation":"search","query":"artificial intelligence","category":"ai"}')

# Don't print the full response with large embedding arrays, just extract what we need
SUCCESS=$(echo "$FILTERED_SEARCH" | jq -r .success)
FILTERED_COUNT=$(echo "$FILTERED_SEARCH" | jq -r '.result.count // 0')
echo "Response: success=$SUCCESS, count=$FILTERED_COUNT"

if [ "$SUCCESS" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Filtered search successful"
else
	echo -e "${RED}✗ FAIL:${NC} Filtered search failed"
	exit 1
fi
echo ""

# Step 7: Check if store exists
echo "Step 7: Checking if vector store exists..."
EXISTS_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"operation":"exists"}')

echo "$EXISTS_RESPONSE" | jq .
EXISTS=$(echo "$EXISTS_RESPONSE" | jq -r '.result.exists')

if [ "$EXISTS" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Vector store exists"
else
	echo -e "${RED}✗ FAIL:${NC} Vector store does not exist"
	exit 1
fi
echo ""

# Step 8: Delete specific vectors
echo "Step 8: Deleting vectors..."
DELETE_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"delete\",\"keys\":[\"${TEST_RUN_ID}-doc1\",\"${TEST_RUN_ID}-doc2\"]}")

echo "$DELETE_RESPONSE" | jq .
SUCCESS=$(echo "$DELETE_RESPONSE" | jq -r .success)

if [ "$SUCCESS" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Delete operation successful"
else
	echo -e "${RED}✗ FAIL:${NC} Delete operation failed"
	exit 1
fi
echo ""

# Step 9: Verify deletion
echo "Step 9: Verifying deletion..."
VERIFY_DELETE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"get\",\"key\":\"${TEST_RUN_ID}-doc1\"}")

echo "$VERIFY_DELETE" | jq .
SUCCESS=$(echo "$VERIFY_DELETE" | jq -r .success)

if [ "$SUCCESS" = "false" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Vector successfully deleted"
else
	echo -e "${RED}✗ FAIL:${NC} Vector still exists after deletion"
	exit 1
fi
echo ""

# Step 10: Cleanup - delete remaining vectors
echo "Step 10: Cleaning up remaining vectors..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"delete\",\"keys\":[\"${TEST_RUN_ID}-doc3\",\"${TEST_RUN_ID}-doc4\"]}" > /dev/null
echo -e "${GREEN}✓${NC} Deleted remaining test vectors"
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Vector storage operations working correctly."
echo "Semantic search functionality verified."
echo "========================================="
echo ""

print_result
