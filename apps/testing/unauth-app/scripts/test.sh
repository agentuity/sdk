#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

echo "🧪 Starting local SQLite services tests..."

# Kill any existing server
echo "🔪 Killing any existing server on port 3500..."
lsof -ti:3500 | xargs kill -9 2>/dev/null || true
sleep 1

# Run workbench tests first
echo "🖥️ Running workbench functionality tests..."
bash scripts/test-workbench.sh
echo ""

# Build the app
echo "🔨 Building unauth-app..."
bun run build

# Start the server in the background
echo "🚀 Starting server..."
bun run .agentuity/app.js &> /tmp/auth-server.log &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Check if server is running
if ! curl -s http://localhost:3500 > /dev/null 2>&1; then
    echo -e "${RED}❌ Server failed to start${NC}"
    cat /tmp/auth-server.log
    exit 1
fi

echo -e "${GREEN}✅ Server started successfully${NC}"
echo ""

# Function to test an endpoint expects success (200)
test_endpoint() {
    local method=$1
    local path=$2
    local description=$3
    local expected_status=200
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    echo "Testing: $description"
    
    # Make the request
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "http://localhost:3500$path")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" "http://localhost:3500$path")
    fi
    
    # Split response into body and status code
    body=$(echo "$response" | sed '$d')
    status_code=$(echo "$response" | tail -1)
    
    # Check status code
    if [ "$status_code" != "$expected_status" ]; then
        echo -e "${RED}  ❌ FAILED: Expected status $expected_status, got $status_code${NC}"
        echo -e "     Response: $body"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
    
    echo -e "${GREEN}  ✅ PASSED${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
}

echo "Testing KeyValue Storage endpoints:"
echo "-----------------------------------"
test_endpoint "GET" "/agent/keyvalue/get" "kv.get()"
test_endpoint "POST" "/agent/keyvalue/set" "kv.set()"
test_endpoint "DELETE" "/agent/keyvalue/delete" "kv.delete()"
echo ""

echo "Testing Object Storage endpoints:"
echo "---------------------------------"
test_endpoint "GET" "/agent/objectstore/get" "objectstore.get()"
test_endpoint "POST" "/agent/objectstore/put" "objectstore.put()"
test_endpoint "DELETE" "/agent/objectstore/delete" "objectstore.delete()"
test_endpoint "GET" "/agent/objectstore/create-public-url" "objectstore.createPublicURL()"
echo ""

echo "Testing Stream Storage endpoints:"
echo "---------------------------------"
test_endpoint "POST" "/agent/stream/create" "stream.create()"
test_endpoint "GET" "/agent/stream/list" "stream.list()"
test_endpoint "DELETE" "/agent/stream/delete" "stream.delete()"
echo ""

echo "Testing Vector Storage endpoints:"
echo "---------------------------------"
test_endpoint "POST" "/agent/vector/upsert" "vector.upsert()"
test_endpoint "GET" "/agent/vector/get" "vector.get()"
test_endpoint "POST" "/agent/vector/get-many" "vector.getMany()"
test_endpoint "POST" "/agent/vector/search" "vector.search()"
test_endpoint "DELETE" "/agent/vector/delete" "vector.delete()"
test_endpoint "GET" "/agent/vector/exists" "vector.exists()"
echo ""

# Cleanup
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
lsof -ti:3500 | xargs kill -9 2>/dev/null || true

# Summary
echo "================================"
echo "Local Services Test Results:"
echo "  Total: $TESTS_RUN"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    echo ""
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
else
    echo -e "  ${RED}Failed: 0${NC}"
    echo ""
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
fi
