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

# Log file path
LOG_FILE="/tmp/custom-server.log"

echo "🧪 Starting custom service implementation tests..."

# Kill any existing server
echo "🔪 Killing any existing server on port 3500..."
lsof -ti:3500 | xargs kill -9 2>/dev/null || true
sleep 1

# Build the app
echo "🔨 Building custom-app..."
bun run build

# Set environment variables needed for session and eval run events
# These are required for events to fire (see _server.ts line 432 and agent.ts eval run logic)
export AGENTUITY_CLOUD_ORG_ID="test-org-001"
export AGENTUITY_CLOUD_PROJECT_ID="test-project-002"

# Start the server in the background
echo "🚀 Starting server..."
bun run .agentuity/app.js &> "$LOG_FILE" &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Check if server is running
if ! curl -s http://localhost:3500 > /dev/null 2>&1; then
    echo -e "${RED}❌ Server failed to start${NC}"
    cat "$LOG_FILE"
    exit 1
fi

echo -e "${GREEN}✅ Server started successfully${NC}"
echo ""

# Function to test an endpoint
test_endpoint() {
    local method=$1
    local path=$2
    local description=$3
    local expected_status=$4
    local expected_data=$5
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    echo "Testing: $description"
    
    # Make the request
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "http://localhost:3500$path")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "http://localhost:3500$path")
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
    
    # Check if expected data is present
    if [[ ! "$body" =~ "$expected_data" ]]; then
        echo -e "${RED}  ❌ FAILED: Expected data containing '$expected_data'${NC}"
        echo -e "     Got: $body"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
    
    echo -e "${GREEN}  ✅ PASSED${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
}

# Function to check if a pattern exists in server logs
check_log_for_pattern() {
    local pattern=$1
    local description=$2
    
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${RED}  ❌ FAILED: Log file not found: $LOG_FILE${NC}"
        return 1
    fi
    
    if grep -q "$pattern" "$LOG_FILE"; then
        echo -e "${GREEN}  ✅ Found: $description${NC}"
        return 0
    else
        echo -e "${RED}  ❌ Missing: $description${NC}"
        return 1
    fi
}

# Function to test evalrun agent and verify events
test_evalrun_events() {
    local method=$1
    local path=$2
    local description=$3
    local request_data=$4
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    echo "Testing: $description"
    
    # Clear any previous matching log entries by getting current log size
    local log_size_before=$(wc -l < "$LOG_FILE" 2>/dev/null || echo "0")
    
    # Make the request
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "http://localhost:3500$path")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$request_data" \
            "http://localhost:3500$path")
    fi
    
    # Split response into body and status code
    body=$(echo "$response" | sed '$d')
    status_code=$(echo "$response" | tail -1)
    
    # Check status code
    if [ "$status_code" != "200" ]; then
        echo -e "${RED}  ❌ FAILED: Expected status 200, got $status_code${NC}"
        echo -e "     Response: $body"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
    
    # Wait for async operations (waitUntil) to complete
    echo "  Waiting for async operations to complete..."
    sleep 5
    
    # Check for all four event patterns
    local all_found=true
    
    if ! check_log_for_pattern "SESSION START EVENT" "Session start event"; then
        all_found=false
    fi
    
    if ! check_log_for_pattern "EVAL RUN START EVENT" "Eval run start event"; then
        all_found=false
    fi
    
    if ! check_log_for_pattern "EVAL RUN COMPLETE EVENT" "Eval run complete event"; then
        all_found=false
    fi
    
    if ! check_log_for_pattern "SESSION COMPLETE EVENT" "Session complete event"; then
        all_found=false
    fi
    
    if [ "$all_found" = true ]; then
        echo -e "${GREEN}  ✅ PASSED: All events found in logs${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}  ❌ FAILED: Not all events found in logs${NC}"
        echo "  Recent log entries:"
        tail -20 "$LOG_FILE" | grep -E "(SESSION|EVAL RUN)" || tail -20 "$LOG_FILE"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo "Testing KeyValue Storage endpoints:"
echo "-----------------------------------"
test_endpoint "GET" "/agent/keyvalue/get" "kv.get()" 200 "kv-data"
test_endpoint "POST" "/agent/keyvalue/set" "kv.set()" 200 "success"
test_endpoint "DELETE" "/agent/keyvalue/delete" "kv.delete()" 200 "success"
echo ""

echo "Testing Object Storage endpoints:"
echo "---------------------------------"
test_endpoint "GET" "/agent/objectstore/get" "objectstore.get()" 200 "custom-object-data"
test_endpoint "POST" "/agent/objectstore/put" "objectstore.put()" 200 "success"
test_endpoint "DELETE" "/agent/objectstore/delete" "objectstore.delete()" 200 "success"
test_endpoint "GET" "/agent/objectstore/create-public-url" "objectstore.createPublicURL()" 200 "custom.example.com"
echo ""

echo "Testing Stream Storage endpoints:"
echo "---------------------------------"
test_endpoint "POST" "/agent/stream/create" "stream.create()" 200 "custom-stream-id"
test_endpoint "GET" "/agent/stream/list" "stream.list()" 200 "custom-stream"
test_endpoint "DELETE" "/agent/stream/delete" "stream.delete()" 200 "success"
echo ""

echo "Testing Vector Storage endpoints:"
echo "---------------------------------"
test_endpoint "POST" "/agent/vector/upsert" "vector.upsert()" 200 "custom-vector-id"
test_endpoint "GET" "/agent/vector/get" "vector.get()" 200 "custom-vector-id"
test_endpoint "POST" "/agent/vector/get-many" "vector.getMany()" 200 "custom-key"
test_endpoint "POST" "/agent/vector/search" "vector.search()" 200 "custom-vector-id"
test_endpoint "DELETE" "/agent/vector/delete" "vector.delete()" 200 "success"
test_endpoint "GET" "/agent/vector/exists" "vector.exists()" 200 "success"
echo ""

echo "Testing EvalRun Event Provider endpoints:"
echo "------------------------------------------"
test_evalrun_events "GET" "/agent/evalrun" "EvalRun agent (GET) - verify events" ""
test_evalrun_events "POST" "/agent/evalrun" "EvalRun agent (POST) - verify events" '{"action":"test-post"}'
echo ""

# Cleanup
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
lsof -ti:3500 | xargs kill -9 2>/dev/null || true

# Summary
echo "================================"
echo "Custom App Test Results:"
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
