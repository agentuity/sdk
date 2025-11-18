#!/bin/bash

# Binary Object Storage Test Script (using Agent endpoint)
# Tests that binary data can be uploaded and downloaded without corruption

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Binary Object Storage Test (Agent)"
echo "========================================="
echo ""

BASE_URL="http://localhost:3500/agent/objectstore"
BUCKET="test-bucket"
PORT=3500

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)

trap cleanup EXIT

# Start server if needed
start_server_if_needed

# Step 1: Test text storage and retrieval
echo "Step 1: Testing text storage..."
PUT_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "put",
    "bucket": "'"$BUCKET"'",
    "key": "text-file.txt",
    "data": "Hello, World! This is a test.",
    "contentType": "text/plain"
  }')

# Check if response is valid JSON
if ! echo "$PUT_RESPONSE" | jq . > /dev/null 2>&1; then
	echo -e "${RED}✗${NC} Failed to store text data - non-JSON response:"
	echo "$PUT_RESPONSE"
	TEST_FAILED=true
	exit 1
fi

if echo "$PUT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
	echo -e "${GREEN}✓${NC} Text data stored successfully"
else
	echo -e "${RED}✗${NC} Failed to store text data"
	echo "$PUT_RESPONSE" | jq .
	TEST_FAILED=true
	exit 1
fi

GET_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "get",
    "bucket": "'"$BUCKET"'",
    "key": "text-file.txt"
  }')

RETRIEVED_TEXT=$(echo "$GET_RESPONSE" | jq -r '.result.data')
if [ "$RETRIEVED_TEXT" = "Hello, World! This is a test." ]; then
	echo -e "${GREEN}✓${NC} Text data retrieved correctly"
else
	echo -e "${RED}✗${NC} Text data mismatch"
	echo "Expected: Hello, World! This is a test."
	echo "Got: $RETRIEVED_TEXT"
	exit 1
fi
echo ""

# Step 2: Test binary storage with problematic bytes
echo "Step 2: Testing binary storage (null bytes, high bytes)..."
# Binary data: [0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD, 0x80, 0x7F]
BINARY_DATA='[0, 1, 2, 255, 254, 253, 128, 127]'

PUT_BINARY=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "putBinary",
    "bucket": "'"$BUCKET"'",
    "key": "binary-file.bin",
    "binaryData": '"$BINARY_DATA"',
    "contentType": "application/octet-stream"
  }')

if echo "$PUT_BINARY" | jq -e '.success == true' > /dev/null 2>&1; then
	echo -e "${GREEN}✓${NC} Binary data stored successfully"
else
	echo -e "${RED}✗${NC} Failed to store binary data"
	echo "$PUT_BINARY" | jq .
	exit 1
fi

GET_BINARY=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "getBinary",
    "bucket": "'"$BUCKET"'",
    "key": "binary-file.bin"
  }')

RETRIEVED_BYTES=$(echo "$GET_BINARY" | jq -c '.result.bytes')
# Normalize both to remove whitespace differences
NORMALIZED_EXPECTED=$(echo "$BINARY_DATA" | jq -c '.')
NORMALIZED_RETRIEVED=$(echo "$RETRIEVED_BYTES" | jq -c '.')
if [ "$NORMALIZED_RETRIEVED" = "$NORMALIZED_EXPECTED" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Binary data integrity verified! Bytes match exactly."
	echo "  Original: $BINARY_DATA"
	echo "  Retrieved: $RETRIEVED_BYTES"
else
	echo -e "${RED}✗ FAIL:${NC} Binary data corrupted!"
	echo "  Expected: $BINARY_DATA"
	echo "  Got: $RETRIEVED_BYTES"
	exit 1
fi
echo ""

# Step 3: Test delete operation
echo "Step 3: Testing delete operation..."
DELETE_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "bucket": "'"$BUCKET"'",
    "key": "text-file.txt"
  }')

if echo "$DELETE_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
	echo -e "${GREEN}✓${NC} Object deleted successfully"
else
	echo -e "${RED}✗${NC} Failed to delete object"
	echo "$DELETE_RESPONSE" | jq .
	exit 1
fi

# Verify it's actually deleted
GET_DELETED=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "get",
    "bucket": "'"$BUCKET"'",
    "key": "text-file.txt"
  }')

if echo "$GET_DELETED" | jq -e '.success == false' > /dev/null 2>&1; then
	echo -e "${GREEN}✓${NC} Verified object was deleted (returns not found)"
else
	echo -e "${RED}✗${NC} Object should not exist after deletion"
	exit 1
fi
echo ""

# Step 4: Test larger binary data
echo "Step 4: Testing larger binary data (1KB random)..."
# Generate array of 1024 random bytes (0-255)
LARGE_BINARY=$(python3 -c "import random; print([random.randint(0, 255) for _ in range(1024)])")

PUT_LARGE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "putBinary",
    "bucket": "'"$BUCKET"'",
    "key": "large-binary.bin",
    "binaryData": '"$LARGE_BINARY"'
  }')

if echo "$PUT_LARGE" | jq -e '.success == true' > /dev/null 2>&1; then
	echo -e "${GREEN}✓${NC} Large binary data stored (1024 bytes)"
else
	echo -e "${RED}✗${NC} Failed to store large binary data"
	echo "$PUT_LARGE" | jq .
	exit 1
fi

GET_LARGE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "getBinary",
    "bucket": "'"$BUCKET"'",
    "key": "large-binary.bin"
  }')

RETRIEVED_LARGE=$(echo "$GET_LARGE" | jq -c '.result.bytes')
RETRIEVED_LENGTH=$(echo "$GET_LARGE" | jq '.result.length')

if [ "$RETRIEVED_LENGTH" = "1024" ]; then
	echo -e "${GREEN}✓${NC} Large binary data retrieved (1024 bytes)"
else
	echo -e "${RED}✗${NC} Length mismatch: expected 1024, got $RETRIEVED_LENGTH"
	exit 1
fi

# Compare arrays (normalize JSON formatting)
NORM_LARGE=$(echo "$LARGE_BINARY" | jq -c '.')
NORM_RETRIEVED=$(echo "$RETRIEVED_LARGE" | jq -c '.')
if [ "$NORM_RETRIEVED" = "$NORM_LARGE" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Large binary data integrity verified!"
else
	echo -e "${RED}✗ FAIL:${NC} Large binary data corrupted!"
	exit 1
fi
echo ""

# Step 5: Cleanup test objects
echo "Step 5: Cleaning up test objects..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"operation": "delete", "bucket": "'"$BUCKET"'", "key": "binary-file.bin"}' > /dev/null

curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"operation": "delete", "bucket": "'"$BUCKET"'", "key": "large-binary.bin"}' > /dev/null

echo -e "${GREEN}✓${NC} Test objects deleted"
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Binary data can be stored and retrieved without corruption."
echo "Tested: null bytes, high bytes, and 1KB random data."
echo "========================================="
echo ""

print_result
