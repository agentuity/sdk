#!/bin/bash

# Test API routes calling agents via ctx.agent
# This verifies that ctx.agent is available in /api/* routes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "Testing API routes calling agents..."
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

source "$SCRIPT_DIR/test-lib.sh"
trap cleanup EXIT INT TERM

# Start server
start_server_if_needed

echo "Testing GET /api/agent-call (agent call from API route)..."
RESPONSE=$(curl -s http://localhost:3500/api/agent-call)
echo "Response: $RESPONSE"

# Check if response contains expected fields
if echo "$RESPONSE" | grep -q '"success":true' && \
   echo "$RESPONSE" | grep -q '"agentResult":"Hello, API Caller! You are 42 years old."' && \
   echo "$RESPONSE" | grep -q '"message":"Successfully called agent from API route"'; then
	echo -e "${GREEN}✓ GET /api/agent-call passed${NC}"
else
	echo -e "${RED}✗ GET /api/agent-call failed${NC}"
	echo "Expected success:true, agentResult with greeting, and success message"
	exit 1
fi

echo ""
echo "Testing POST /api/agent-call/with-input (agent call with custom input)..."
RESPONSE=$(curl -s -X POST http://localhost:3500/api/agent-call/with-input \
	-H "Content-Type: application/json" \
	-d '{"name":"Bob","age":25}')
echo "Response: $RESPONSE"

# Check if response contains expected fields
if echo "$RESPONSE" | grep -q '"success":true' && \
   echo "$RESPONSE" | grep -q '"agentResult":"Hello, Bob! You are 25 years old."' && \
   echo "$RESPONSE" | grep -q '"message":"Successfully called agent from API route with custom input"'; then
	echo -e "${GREEN}✓ POST /api/agent-call/with-input passed${NC}"
else
	echo -e "${RED}✗ POST /api/agent-call/with-input failed${NC}"
	echo "Expected success:true, agentResult with custom greeting, and success message"
	exit 1
fi

echo ""
echo "Testing POST /api/agent-call/with-input with different input..."
RESPONSE=$(curl -s -X POST http://localhost:3500/api/agent-call/with-input \
	-H "Content-Type: application/json" \
	-d '{"name":"Alice","age":30}')
echo "Response: $RESPONSE"

# Check if response contains expected fields
if echo "$RESPONSE" | grep -q '"success":true' && \
   echo "$RESPONSE" | grep -q '"agentResult":"Hello, Alice! You are 30 years old."'; then
	echo -e "${GREEN}✓ POST /api/agent-call/with-input with different input passed${NC}"
else
	echo -e "${RED}✗ POST /api/agent-call/with-input with different input failed${NC}"
	exit 1
fi

echo ""
echo -e "${GREEN}All API agent call tests passed!${NC}"
echo ""

# Cleanup will be handled by trap
