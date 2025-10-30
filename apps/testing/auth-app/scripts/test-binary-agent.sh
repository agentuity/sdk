#!/bin/bash

# Binary Object Storage Test Script (using Agent endpoint)
# Tests that binary data can be uploaded and downloaded without corruption

set -e

echo "========================================="
echo "Binary Object Storage Test (Agent)"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000/agent/objectstore"
BUCKET="test-bucket"
PORT=3000

# Track if we started the server
SERVER_STARTED=false
SERVER_PID=""

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)

# Cleanup function
cleanup() {
	echo ""
	echo "Cleaning up..."
	rm -rf "$TEMP_DIR"
	
	# Stop server if we started it
	if [ "$SERVER_STARTED" = true ] && [ -n "$SERVER_PID" ]; then
		echo "Stopping test server (PID: $SERVER_PID)..."
		kill $SERVER_PID 2>/dev/null || true
		wait $SERVER_PID 2>/dev/null || true
		# Force kill any remaining processes on the port (cross-platform)
		if command -v lsof &> /dev/null; then
			lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
		elif command -v fuser &> /dev/null; then
			fuser -k $PORT/tcp 2>/dev/null || true
		fi
		echo -e "${GREEN}✓${NC} Server stopped"
	fi
}

trap cleanup EXIT

# Check if server is already running
check_server() {
	local code
	code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/ 2>/dev/null)
	if [ $? -eq 0 ]; then
		echo "$code"
	else
		echo "000"
	fi
}

# Wait for server to be ready
wait_for_server() {
	local max_attempts=30
	local attempt=0
	
	echo "Waiting for server to be ready..."
	while [ $attempt -lt $max_attempts ]; do
		if [ "$(check_server)" != "000" ]; then
			echo -e "${GREEN}✓${NC} Server is ready"
			return 0
		fi
		attempt=$((attempt + 1))
		sleep 1
		echo -n "."
	done
	
	echo ""
	echo -e "${RED}✗${NC} Server failed to start within 30 seconds"
	return 1
}

# Check if server is running, start if needed
echo "Checking if server is running on port $PORT..."
if [ "$(check_server)" != "000" ]; then
	echo -e "${YELLOW}ℹ${NC} Server is already running"
else
	echo "Starting test server..."
	
	# Change to test-app directory (script is in test-app/scripts/)
	cd "$(dirname "$0")/.."
	
	# Check if .env file exists in test-app directory
	if [ ! -f .env ]; then
		echo -e "${RED}✗${NC} .env file not found in test-app directory"
		echo "Please create a .env file in test-app with AGENTUITY_SDK_KEY"
		echo "Current directory: $(pwd)"
		exit 1
	fi
	
	# Start server in background, redirecting output to temp log
	# Bun automatically loads .env from current directory
	LOG_FILE="$TEMP_DIR/server.log"
	bun run dev > "$LOG_FILE" 2>&1 &
	SERVER_PID=$!
	SERVER_STARTED=true
	
	echo "Server starting (PID: $SERVER_PID, log: $LOG_FILE)..."
	
	# Wait for server to be ready
	if ! wait_for_server; then
		echo "Server logs:"
		cat "$LOG_FILE"
		exit 1
	fi
fi

echo ""
echo "Test directory: $TEMP_DIR"
echo ""

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

if echo "$PUT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
	echo -e "${GREEN}✓${NC} Text data stored successfully"
else
	echo -e "${RED}✗${NC} Failed to store text data"
	echo "$PUT_RESPONSE" | jq .
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

if [ "$SERVER_STARTED" = true ]; then
	echo -e "${YELLOW}Note:${NC} Server was started by this script and will be stopped on exit"
else
	echo -e "${YELLOW}Note:${NC} Server was already running and will remain running"
fi
