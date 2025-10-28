#!/bin/bash

# Test that the server auto-start/stop logic works correctly
# This doesn't run the full binary test, just verifies server management

set -e

echo "Testing server management logic..."
echo ""

PORT=3000

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Check if server is running
check_server() {
	local code
	code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/ 2>/dev/null)
	if [ $? -eq 0 ]; then
		echo "$code"
	else
		echo "000"
	fi
}

# Test 1: Server not running initially
echo "Test 1: Checking if server is NOT running..."
if [ "$(check_server)" = "000" ]; then
	echo -e "${GREEN}✓${NC} Server is not running (as expected)"
else
	echo -e "${RED}✗${NC} Server is already running. Please stop it first:"
	echo "  lsof -ti:$PORT | xargs kill -9"
	exit 1
fi
echo ""

# Test 2: Start server in background
echo "Test 2: Starting server..."
cd "$(dirname "$0")/.."
LOG_FILE=$(mktemp)
bun run dev > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"
echo "Log file: $LOG_FILE"

# Wait for server to be ready
echo "Waiting for server..."
for i in {1..30}; do
	if [ "$(check_server)" != "000" ]; then
		echo -e "${GREEN}✓${NC} Server is ready (took $i seconds)"
		break
	fi
	sleep 1
	echo -n "."
done
echo ""

if [ "$(check_server)" = "000" ]; then
	echo -e "${RED}✗${NC} Server failed to start"
	echo "Server logs:"
	cat "$LOG_FILE"
	kill $SERVER_PID 2>/dev/null || true
	rm "$LOG_FILE"
	exit 1
fi
echo ""

# Test 3: Verify server responds
echo "Test 3: Testing server response..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
	echo -e "${GREEN}✓${NC} Server responds (HTTP $HTTP_CODE)"
else
	echo -e "${RED}✗${NC} Unexpected HTTP code: $HTTP_CODE"
fi
echo ""

# Test 4: Stop server
echo "Test 4: Stopping server..."
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

# Give it a moment to fully stop
sleep 2

if [ "$(check_server)" = "000" ]; then
	echo -e "${GREEN}✓${NC} Server stopped successfully"
else
	echo -e "${RED}✗${NC} Server is still running"
	exit 1
fi
echo ""

# Cleanup
rm "$LOG_FILE"

echo "========================================="
echo -e "${GREEN}All server management tests passed!${NC}"
echo "========================================="
echo ""
echo "The test script should work correctly."
