#!/bin/bash

# KeyValue Storage Test Script
# Tests CRUD operations for KeyValue storage

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "KeyValue Storage Test"
echo "========================================="
echo ""

# Generate unique key prefix for this test run to avoid collisions in concurrent tests
TEST_RUN_ID="test-$(date +%s%N)"
echo "Test Run ID: $TEST_RUN_ID"
echo ""

BASE_URL="http://localhost:3000/agent/keyvalue"
PORT=3000

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)

trap cleanup EXIT

# Start server if needed
start_server_if_needed

# Step 1: Set a key-value pair
echo "Step 1: Setting key-value pair..."
SET_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"set\",\"key\":\"${TEST_RUN_ID}-key\",\"value\":\"Hello KeyValue!\"}")

if echo "$SET_RESPONSE" | jq . > /dev/null 2>&1; then
	echo "$SET_RESPONSE" | jq .
	SUCCESS=$(echo "$SET_RESPONSE" | jq -r .success)
	if [ "$SUCCESS" = "true" ]; then
		echo -e "${GREEN}✓ PASS:${NC} Set operation successful"
	else
		echo -e "${RED}✗ FAIL:${NC} Set operation failed"
		exit 1
	fi
else
	echo "Error: Non-JSON response:"
	echo "$SET_RESPONSE"
	exit 1
fi
echo ""

# Step 2: Get the value back
echo "Step 2: Getting value back..."
GET_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"get\",\"key\":\"${TEST_RUN_ID}-key\"}")

echo "$GET_RESPONSE" | jq .
SUCCESS=$(echo "$GET_RESPONSE" | jq -r .success)
VALUE=$(echo "$GET_RESPONSE" | jq -r .result)

if [ "$SUCCESS" = "true" ] && [ "$VALUE" = "Hello KeyValue!" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Get operation successful, value matches"
else
	echo -e "${RED}✗ FAIL:${NC} Get operation failed or value mismatch"
	exit 1
fi
echo ""

# Step 3: Update the value
echo "Step 3: Updating value..."
UPDATE_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"set\",\"key\":\"${TEST_RUN_ID}-key\",\"value\":\"Updated value!\"}")

echo "$UPDATE_RESPONSE" | jq .
SUCCESS=$(echo "$UPDATE_RESPONSE" | jq -r .success)

if [ "$SUCCESS" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Update operation successful"
else
	echo -e "${RED}✗ FAIL:${NC} Update operation failed"
	exit 1
fi
echo ""

# Step 4: Verify updated value
echo "Step 4: Verifying updated value..."
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"get\",\"key\":\"${TEST_RUN_ID}-key\"}")

echo "$VERIFY_RESPONSE" | jq .
VALUE=$(echo "$VERIFY_RESPONSE" | jq -r .result)

if [ "$VALUE" = "Updated value!" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Updated value verified"
else
	echo -e "${RED}✗ FAIL:${NC} Value mismatch after update"
	exit 1
fi
echo ""

# Step 5: Set multiple keys
echo "Step 5: Setting multiple keys..."
for i in {1..3}; do
	curl -s -X POST "$BASE_URL" \
	  -H "Content-Type: application/json" \
	  -d "{\"operation\":\"set\",\"key\":\"${TEST_RUN_ID}-multi-key-$i\",\"value\":\"Value $i\"}" > /dev/null
done
echo -e "${GREEN}✓${NC} Set 3 additional keys"
echo ""

# Step 6: Delete a key
echo "Step 6: Deleting key..."
DELETE_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"delete\",\"key\":\"${TEST_RUN_ID}-key\"}")

echo "$DELETE_RESPONSE" | jq .
SUCCESS=$(echo "$DELETE_RESPONSE" | jq -r .success)

if [ "$SUCCESS" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Delete operation successful"
else
	echo -e "${RED}✗ FAIL:${NC} Delete operation failed"
	exit 1
fi
echo ""

# Step 7: Verify key is deleted
echo "Step 7: Verifying key is deleted..."
VERIFY_DELETE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"get\",\"key\":\"${TEST_RUN_ID}-key\"}")

echo "$VERIFY_DELETE" | jq .
SUCCESS=$(echo "$VERIFY_DELETE" | jq -r .success)

if [ "$SUCCESS" = "false" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Key successfully deleted"
else
	echo -e "${RED}✗ FAIL:${NC} Key still exists after deletion"
	exit 1
fi
echo ""

# Step 8: Cleanup - delete remaining test keys
echo "Step 8: Cleaning up remaining keys..."
for i in {1..3}; do
	curl -s -X POST "$BASE_URL" \
	  -H "Content-Type: application/json" \
	  -d "{\"operation\":\"delete\",\"key\":\"${TEST_RUN_ID}-multi-key-$i\"}" > /dev/null
done
echo -e "${GREEN}✓${NC} Deleted remaining test keys"
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "KeyValue storage CRUD operations working correctly."
echo "========================================="
echo ""

print_result
