#!/bin/bash

# Binary Object Storage Test Script
# Tests that binary data can be uploaded and downloaded without corruption

set -e

echo "========================================="
echo "Binary Object Storage Test"
echo "========================================="
echo ""

# Generate unique key prefix for this test run to avoid collisions in concurrent tests
TEST_RUN_ID="test-$(date +%s%N)"
echo "Test Run ID: $TEST_RUN_ID"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3500/api/objectstore"
BUCKET="test-bucket"
KEY="binary-test.bin"
PORT=3500

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
		# Kill gravity processes first (they may be holding the port)
		pkill -9 -f gravity 2>/dev/null || true
		# Kill the server process
		kill "$SERVER_PID" 2>/dev/null || true
		wait "$SERVER_PID" 2>/dev/null || true
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
	# Start in a new process group using set -m (job control)
	LOG_FILE="$TEMP_DIR/server.log"
	set -m
	bun run dev -- --no-public > "$LOG_FILE" 2>&1 &
	SERVER_PID=$!
	set +m
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

# Step 1: Create a test file with random binary data
echo "Step 1: Creating test file with random binary data (1KB)..."
dd if=/dev/urandom of="$TEMP_DIR/original.bin" bs=1024 count=1 2>/dev/null
ORIGINAL_MD5=$(md5sum "$TEMP_DIR/original.bin" | cut -d' ' -f1)
echo -e "${GREEN}✓${NC} Created original.bin (MD5: $ORIGINAL_MD5)"
echo ""

# Step 2: Create a file with problematic bytes (null bytes, high bytes)
echo "Step 2: Creating file with problematic bytes..."
printf '\x00\x01\x02\xFF\xFE\xFD\x80\x7F\x00\xFF' > "$TEMP_DIR/problematic.bin"
PROBLEMATIC_MD5=$(md5sum "$TEMP_DIR/problematic.bin" | cut -d' ' -f1)
echo -e "${GREEN}✓${NC} Created problematic.bin (MD5: $PROBLEMATIC_MD5)"
echo ""

# Step 3: Upload random binary file
echo "Step 3: Uploading random binary data..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-random.bin" \
  --data-binary "@$TEMP_DIR/original.bin" \
  -H "Content-Type: application/octet-stream")

# Check if response is JSON before piping to jq
if echo "$UPLOAD_RESPONSE" | jq . > /dev/null 2>&1; then
	echo "$UPLOAD_RESPONSE" | jq .
else
	echo "Error: Non-JSON response:"
	echo "$UPLOAD_RESPONSE"
	echo ""
	echo "Server logs:"
	tail -20 "$LOG_FILE"
	exit 1
fi
echo ""

# Step 4: Download random binary file
echo "Step 4: Downloading random binary data..."
curl -s "$BASE_URL/$BUCKET/${TEST_RUN_ID}-random.bin" -o "$TEMP_DIR/downloaded-random.bin"
DOWNLOADED_RANDOM_MD5=$(md5sum "$TEMP_DIR/downloaded-random.bin" | cut -d' ' -f1)
echo -e "Downloaded (MD5: $DOWNLOADED_RANDOM_MD5)"

# Verify random file
if [ "$ORIGINAL_MD5" = "$DOWNLOADED_RANDOM_MD5" ]; then
  echo -e "${GREEN}✓ PASS:${NC} Random binary data integrity verified!"
else
  echo -e "${RED}✗ FAIL:${NC} Random binary data corrupted!"
  exit 1
fi
echo ""

# Step 5: Upload problematic binary file
echo "Step 5: Uploading problematic binary data (null bytes, high bytes)..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-problematic.bin" \
  --data-binary "@$TEMP_DIR/problematic.bin" \
  -H "Content-Type: application/octet-stream")
echo "$UPLOAD_RESPONSE" | jq .
echo ""

# Step 6: Download problematic binary file
echo "Step 6: Downloading problematic binary data..."
curl -s "$BASE_URL/$BUCKET/${TEST_RUN_ID}-problematic.bin" -o "$TEMP_DIR/downloaded-problematic.bin"
DOWNLOADED_PROBLEMATIC_MD5=$(md5sum "$TEMP_DIR/downloaded-problematic.bin" | cut -d' ' -f1)
echo -e "Downloaded (MD5: $DOWNLOADED_PROBLEMATIC_MD5)"

# Verify problematic file
if [ "$PROBLEMATIC_MD5" = "$DOWNLOADED_PROBLEMATIC_MD5" ]; then
  echo -e "${GREEN}✓ PASS:${NC} Problematic binary data integrity verified!"
else
  echo -e "${RED}✗ FAIL:${NC} Problematic binary data corrupted!"
  exit 1
fi
echo ""

# Step 7: Byte-by-byte comparison
echo "Step 7: Byte-by-byte comparison..."
if diff "$TEMP_DIR/problematic.bin" "$TEMP_DIR/downloaded-problematic.bin" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ PASS:${NC} Byte-by-byte comparison successful!"
else
  echo -e "${RED}✗ FAIL:${NC} Files differ!"
  exit 1
fi
echo ""

# Step 8: Test image upload (if available)
if command -v convert &> /dev/null; then
  echo "Step 8: Testing image upload..."
  # Create a test image
  convert -size 100x100 xc:blue "$TEMP_DIR/test.jpg"
  
  curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.jpg" \
    --data-binary "@$TEMP_DIR/test.jpg" \
    -H "Content-Type: image/jpeg" > /dev/null
  
  curl -s "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.jpg" -o "$TEMP_DIR/downloaded.jpg"
  
  TEST_MD5=$(md5sum "$TEMP_DIR/test.jpg" | cut -d' ' -f1)
  DOWNLOADED_MD5=$(md5sum "$TEMP_DIR/downloaded.jpg" | cut -d' ' -f1)
  
  if [ "$TEST_MD5" = "$DOWNLOADED_MD5" ]; then
    echo -e "${GREEN}✓ PASS:${NC} Image upload/download successful!"
  else
    echo -e "${RED}✗ FAIL:${NC} Image data corrupted!"
    exit 1
  fi
  echo ""
fi

# Step 9: Create public URL
echo "Step 9: Creating public URL..."
PUBLIC_URL_RESPONSE=$(curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-random.bin/public-url")
echo "$PUBLIC_URL_RESPONSE" | jq .
PUBLIC_URL=$(echo "$PUBLIC_URL_RESPONSE" | jq -r .url)
echo -e "${GREEN}✓${NC} Public URL: $PUBLIC_URL"
echo ""

# Step 10: Cleanup - delete test objects
echo "Step 10: Cleaning up..."
curl -s -X DELETE "$BASE_URL/$BUCKET/${TEST_RUN_ID}-random.bin" > /dev/null
curl -s -X DELETE "$BASE_URL/$BUCKET/${TEST_RUN_ID}-problematic.bin" > /dev/null
[ -f "$TEMP_DIR/test.jpg" ] && curl -s -X DELETE "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.jpg" > /dev/null
echo -e "${GREEN}✓${NC} Deleted test objects"
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Binary data can be uploaded and downloaded without corruption."
echo "========================================="
echo ""

if [ "$SERVER_STARTED" = true ]; then
	echo -e "${YELLOW}Note:${NC} Server was started by this script and will be stopped on exit"
else
	echo -e "${YELLOW}Note:${NC} Server was already running and will remain running"
fi
