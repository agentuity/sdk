#!/bin/bash

# Test waitUntil functionality
# Tests both c.waitUntil() and c.executionCtx.waitUntil()

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "Testing waitUntil functionality..."
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

source "$SCRIPT_DIR/test-lib.sh"
trap cleanup EXIT INT TERM

# Start server
start_server_if_needed

echo "Testing GET /agent/async (c.waitUntil)..."
RESPONSE=$(curl -s http://localhost:3500/agent/async)
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "Async task started"; then
	echo -e "${GREEN}✓ GET /agent/async passed${NC}"
else
	echo -e "${RED}✗ GET /agent/async failed${NC}"
	echo "Expected 'Async task started'"
	exit 1
fi

echo ""
echo "Testing GET /agent/async/execution-ctx (c.executionCtx.waitUntil)..."
RESPONSE=$(curl -s http://localhost:3500/agent/async/execution-ctx)
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "Async task started via executionCtx"; then
	echo -e "${GREEN}✓ GET /agent/async/execution-ctx passed${NC}"
else
	echo -e "${RED}✗ GET /agent/async/execution-ctx failed${NC}"
	echo "Expected 'Async task started via executionCtx'"
	exit 1
fi

# Test that idle endpoint shows pending work
echo ""
echo "Testing /_agentuity/idle returns NO while waitUntil is pending..."

# Trigger a waitUntil and immediately check idle status
curl -s http://localhost:3500/agent/async/execution-ctx > /dev/null
IDLE_RESPONSE=$(curl -s http://localhost:3500/_agentuity/idle)
echo "Idle response (should be NO): $IDLE_RESPONSE"

if [ "$IDLE_RESPONSE" = "NO" ]; then
	echo -e "${GREEN}✓ Server correctly reports NOT idle while waitUntil pending${NC}"
else
	echo -e "${YELLOW}⚠ Server reported idle=$IDLE_RESPONSE (task may have completed quickly)${NC}"
fi

# Wait for async operations to complete (async agent has 3s timeout)
echo ""
echo "Waiting for async operations (waitUntil) to complete..."
sleep 5

# Verify server is now idle
IDLE_RESPONSE=$(curl -s http://localhost:3500/_agentuity/idle)
echo "Idle response (should be OK): $IDLE_RESPONSE"

if [ "$IDLE_RESPONSE" = "OK" ]; then
	echo -e "${GREEN}✓ Server correctly reports idle after waitUntil completed${NC}"
else
	echo -e "${RED}✗ Server still not idle after waiting${NC}"
	exit 1
fi

echo ""
echo -e "${GREEN}All waitUntil tests passed!${NC}"
echo ""
