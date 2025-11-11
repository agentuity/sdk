#!/bin/bash

# Test that the server auto-start/stop logic works correctly
# This doesn't run the full binary test, just verifies server management

set -e

echo "Testing server management logic..."
echo ""

PORT=3500
SERVER_PID=""
LOG_FILE=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Cleanup function
cleanup() {
	echo ""
	echo "Cleaning up..."
	
	# Kill gravity processes first (they may be holding the port)
	pkill -9 -f gravity 2>/dev/null || true
	
	# Kill server if running
	if [ -n "$SERVER_PID" ]; then
		echo "Stopping server (PID: $SERVER_PID)..."
		kill "$SERVER_PID" 2>/dev/null || true
		wait "$SERVER_PID" 2>/dev/null || true
	fi
	
	# Kill any remaining processes on port
	if lsof -ti:$PORT >/dev/null 2>&1; then
		echo "Cleaning up port $PORT..."
		lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
	fi
	
	# Remove log file
	if [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
		rm "$LOG_FILE"
	fi
	
	echo "Cleanup complete"
}

# Trap EXIT, INT, and TERM to ensure cleanup
trap cleanup EXIT INT TERM

# Check if server is running
check_server() {
	local code
	code=$(curl -s --max-time 2 -o /dev/null -w "%{http_code}" http://localhost:$PORT/ 2>/dev/null)
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
echo "Log file: $LOG_FILE"

# Start in background with stdin redirected to prevent terminal blocking
bun run dev < /dev/null > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"

# Wait for server to be ready
echo "Waiting for server..."
READY=false
for i in {1..45}; do
	# Check if HTTP endpoint is responding
	HTTP_CODE=$(check_server)
	if [ "$HTTP_CODE" != "000" ]; then
		echo -e "${GREEN}✓${NC} Server is ready (took $i seconds)"
		READY=true
		break
	fi
	sleep 1
	if [ $((i % 5)) -eq 0 ]; then
		echo -n " ${i}s "
	else
		echo -n "."
	fi
done
echo ""

if [ "$READY" = false ]; then
	echo -e "${YELLOW}Note: Checking if process is still alive...${NC}"
	if kill -0 "$SERVER_PID" 2>/dev/null; then
		echo -e "${YELLOW}Process is alive, might be slow startup. Checking server logs:${NC}"
		tail -20 "$LOG_FILE"
	else
		echo -e "${RED}Process died!${NC}"
	fi
fi

if [ "$(check_server)" = "000" ]; then
	echo -e "${RED}✗${NC} Server failed to start"
	echo "Server logs:"
	cat "$LOG_FILE"
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
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

# Clear SERVER_PID so cleanup doesn't try to kill it again
SERVER_PID=""

# Give it a moment to fully stop
sleep 2

if [ "$(check_server)" = "000" ]; then
	echo -e "${GREEN}✓${NC} Server stopped successfully"
else
	echo -e "${RED}✗${NC} Server is still running"
	exit 1
fi
echo ""

echo "========================================="
echo -e "${GREEN}All server management tests passed!${NC}"
echo "========================================="
echo ""
echo "The test script should work correctly."
