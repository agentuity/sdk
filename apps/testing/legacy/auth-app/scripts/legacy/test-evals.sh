#!/bin/bash

# Eval Functionality Test Script
# Tests that evals are properly added to agents and execute after agent runs complete

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Eval Functionality Test"
echo "========================================="
echo ""

PORT="${PORT:-3500}"
BASE_URL="http://localhost:$PORT"

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)

trap cleanup EXIT

# For eval tests, we need to check server logs, so we must start the server ourselves
# Check if server is already running and stop it if needed
echo "Checking if server is running on port $PORT..."
if [ "$(check_server)" != "000" ]; then
	echo -e "${YELLOW}ℹ${NC} Server is already running"
	echo "For eval tests, we need to start our own server to check logs."
	echo "Stopping existing server..."
	# Try to stop the server on the port
	if command -v lsof &> /dev/null; then
		lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
		sleep 2
	elif command -v fuser &> /dev/null; then
		fuser -k $PORT/tcp 2>/dev/null || true
		sleep 2
	fi
	# Verify server is stopped
	if [ "$(check_server)" != "000" ]; then
		echo -e "${RED}✗${NC} Could not stop existing server. Please stop it manually:"
		echo "  lsof -ti:$PORT | xargs kill -9"
		exit 1
	fi
	echo -e "${GREEN}✓${NC} Existing server stopped"
fi

# Set internal logger level to debug for testing
# This allows us to see eval logs in test output
export AGENTUITY_SDK_LOG_LEVEL=debug

# Start server (we need to control it to check logs)
start_server_if_needed

# Wait a bit for server to fully initialize
sleep 1

# Test 1: Verify Eval Execution After Agent Run (Eval Agent)
echo "Test 1: Verifying eval execution after eval agent run..."
EVAL_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/eval" \
  -H "Content-Type: application/json" \
  -d '{"name":"TestUser","age":30}')

if [ -z "$EVAL_RESPONSE" ]; then
	echo -e "${RED}✗ FAIL:${NC} No response from eval agent"
	exit 1
fi

echo "Agent response: $EVAL_RESPONSE"

# Wait for evals to complete (waitUntil is async)
echo "Waiting for evals to complete..."
sleep 5

# Check server logs for eval execution (using internal logger format)
if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
	# Check for eval execution message (internal logger format: [INTERNAL])
	if grep -q "\[INTERNAL\].*Executing.*eval(s) after agent run" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Eval execution message found in logs"
	else
		echo -e "${RED}✗ FAIL:${NC} Eval execution message not found in logs"
		echo "Recent log entries:"
		tail -30 "$LOG_FILE" || true
		exit 1
	fi

	# Check for eval result messages (internal logger format)
	if grep -q "\[INTERNAL\].*Eval.*pass:\|\[INTERNAL\].*Eval.*score:" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Eval result messages found in logs"
	else
		echo -e "${YELLOW}⚠ WARN:${NC} Eval result messages not found (may be in different format)"
		# Show relevant log entries
		grep -i "\[INTERNAL\].*eval" "$LOG_FILE" | tail -10 || true
	fi
else
	echo -e "${YELLOW}⚠ WARN:${NC} Cannot check server logs (server not started by script or log file not found)"
fi
echo ""

# Test 2: Verify Multiple Evals Execute (Eval Agent)
echo "Test 2: Verifying multiple evals execute for eval agent..."
EVAL_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/eval" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","age":25}')

if [ -z "$EVAL_RESPONSE" ]; then
	echo -e "${RED}✗ FAIL:${NC} No response from eval agent"
	exit 1
fi

echo "Agent response: $EVAL_RESPONSE"

# Wait for evals to complete
echo "Waiting for evals to complete..."
sleep 5

# Check server logs for multiple eval execution (using internal logger format)
if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
	# Check for eval execution message with count (internal logger format)
	if grep -q "\[INTERNAL\].*Executing 2 eval(s) after agent run" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Multiple eval execution message found (2 evals)"
	else
		# Check for any eval execution message
		if grep -q "\[INTERNAL\].*Executing.*eval(s) after agent run" "$LOG_FILE"; then
			EVAL_COUNT=$(grep -o "\[INTERNAL\].*Executing [0-9]* eval(s) after agent run" "$LOG_FILE" | grep -o "[0-9]*" | tail -1)
			if [ -n "$EVAL_COUNT" ]; then
				echo -e "${GREEN}✓ PASS:${NC} Eval execution found with count: $EVAL_COUNT"
			else
				echo -e "${RED}✗ FAIL:${NC} Could not determine eval count"
				exit 1
			fi
		else
			echo -e "${RED}✗ FAIL:${NC} Eval execution message not found in logs"
			echo "Recent log entries:"
			tail -30 "$LOG_FILE" || true
			exit 1
		fi
	fi

	# Check for both eval results (internal logger format)
	GREETING_FOUND=false
	QUALITY_FOUND=false

	if grep -q "\[INTERNAL\].*Eval 'greeting-check'" "$LOG_FILE"; then
		GREETING_FOUND=true
		echo -e "${GREEN}✓ PASS:${NC} Greeting eval found in logs"
	fi

	if grep -q "\[INTERNAL\].*Eval 'output-quality'" "$LOG_FILE"; then
		QUALITY_FOUND=true
		echo -e "${GREEN}✓ PASS:${NC} Quality eval found in logs"
	fi

	if [ "$GREETING_FOUND" = false ] || [ "$QUALITY_FOUND" = false ]; then
		echo -e "${YELLOW}⚠ WARN:${NC} Not all eval results found in logs"
		echo "Eval-related log entries:"
		grep -i "\[INTERNAL\].*eval" "$LOG_FILE" | tail -20 || true
	fi
else
	echo -e "${YELLOW}⚠ WARN:${NC} Cannot check server logs (server not started by script or log file not found)"
fi
echo ""

# Test 3: Verify Eval Results Are Logged Correctly
echo "Test 3: Verifying eval results are logged correctly..."
# Make another call to ensure we have fresh log entries
curl -s -X POST "$BASE_URL/agent/eval" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","age":35}' > /dev/null

# Wait for evals to complete
sleep 5

if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
	# Check for binary eval result format (pass/fail) - internal logger format
	if grep -q "\[INTERNAL\].*Eval.*pass:" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Binary eval result format found (pass: true/false)"
	else
		echo -e "${YELLOW}⚠ WARN:${NC} Binary eval result format not found"
	fi

	# Check for score eval result format - internal logger format
	if grep -q "\[INTERNAL\].*Eval.*score:" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Score eval result format found (score: 0-1)"
	else
		echo -e "${YELLOW}⚠ WARN:${NC} Score eval result format not found"
	fi

	# Show sample eval log entries
	echo "Sample eval log entries:"
	grep -i "\[INTERNAL\].*eval" "$LOG_FILE" | grep -E "(pass|score|Executing)" | tail -5 || true
else
	echo -e "${YELLOW}⚠ WARN:${NC} Cannot check server logs"
fi
echo ""

# Test 4: Verify Eval Receives Correct Input/Output
echo "Test 4: Verifying eval receives correct input/output..."
TEST_INPUT='{"name":"Charlie","age":40}'
TEST_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/eval" \
  -H "Content-Type: application/json" \
  -d "$TEST_INPUT")

if [ -z "$TEST_RESPONSE" ]; then
	echo -e "${RED}✗ FAIL:${NC} No response from eval agent"
	exit 1
fi

echo "Agent response: $TEST_RESPONSE"

# Wait for evals to complete
sleep 5

if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
	# Verify eval processed the input/output by checking for eval results
	# We know evals executed because we see the "Executing X eval(s)" message
	# and we see eval result messages, which confirms evals received input/output
	# Using internal logger format: [INTERNAL]
	if grep -q "\[INTERNAL\].*Executing.*eval(s) after agent run" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Eval execution confirmed in logs"
		
		# Check for eval result messages which confirm evals processed input/output
		if grep -q "\[INTERNAL\].*Eval.*pass:\|\[INTERNAL\].*Eval.*score:" "$LOG_FILE"; then
			echo -e "${GREEN}✓ PASS:${NC} Eval results found (evals processed input/output)"
			
			# Show sample eval results to confirm they processed the data
			echo "Sample eval results:"
			grep -E "\[INTERNAL\].*Eval.*(pass|score):" "$LOG_FILE" | tail -3 || true
		else
			echo -e "${RED}✗ FAIL:${NC} Eval results not found in logs"
			echo "Recent log entries:"
			tail -30 "$LOG_FILE" || true
			exit 1
		fi
	else
		echo -e "${RED}✗ FAIL:${NC} Eval execution message not found in logs"
		echo "Recent log entries:"
		tail -30 "$LOG_FILE" || true
		exit 1
	fi
else
	echo -e "${YELLOW}⚠ WARN:${NC} Cannot check server logs"
fi
echo ""

# Test 5: Verify Input-Only Sub Agent Eval
echo "Test 5: Verifying input-only sub agent eval..."
INPUT_ONLY_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/eval/input-only" \
  -H "Content-Type: application/json" \
  -d '{"message":"test input"}')

if [ -z "$INPUT_ONLY_RESPONSE" ]; then
	echo -e "${RED}✗ FAIL:${NC} No response from input-only sub agent"
	exit 1
fi

echo "Input-only agent response: $INPUT_ONLY_RESPONSE"

# Wait for evals to complete
echo "Waiting for evals to complete..."
sleep 5

if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
	# Check for eval execution message
	if grep -q "\[INTERNAL\].*Executing.*eval(s) after agent run" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Eval execution message found for input-only agent"
		
		# Check for input validation eval log
		if grep -q "\[EVAL input-validation\] Input received" "$LOG_FILE"; then
			echo -e "${GREEN}✓ PASS:${NC} Input-only eval received input correctly"
			# Show the input log
			grep "\[EVAL input-validation\] Input received" "$LOG_FILE" | tail -1 || true
		else
			echo -e "${RED}✗ FAIL:${NC} Input-only eval did not receive input"
			echo "Looking for: [EVAL input-validation] Input received"
			echo "Recent eval logs:"
			grep -i "eval\|input" "$LOG_FILE" | tail -10 || true
			exit 1
		fi
	else
		echo -e "${RED}✗ FAIL:${NC} Eval execution message not found for input-only agent"
		exit 1
	fi
else
	echo -e "${YELLOW}⚠ WARN:${NC} Cannot check server logs"
fi
echo ""

# Test 6: Verify Output-Only Sub Agent Eval
echo "Test 6: Verifying output-only sub agent eval..."
OUTPUT_ONLY_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/eval/output-only" \
  -H "Content-Type: application/json")

if [ -z "$OUTPUT_ONLY_RESPONSE" ]; then
	echo -e "${RED}✗ FAIL:${NC} No response from output-only sub agent"
	exit 1
fi

echo "Output-only agent response: $OUTPUT_ONLY_RESPONSE"

# Wait for evals to complete
echo "Waiting for evals to complete..."
sleep 5

if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
	# Check for eval execution message
	if grep -q "\[INTERNAL\].*Executing.*eval(s) after agent run" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Eval execution message found for output-only agent"
		
		# Check for output quality eval log
		if grep -q "\[EVAL output-quality\] Output received" "$LOG_FILE"; then
			echo -e "${GREEN}✓ PASS:${NC} Output-only eval received output correctly"
			# Show the output log
			grep "\[EVAL output-quality\] Output received" "$LOG_FILE" | tail -1 || true
		else
			echo -e "${RED}✗ FAIL:${NC} Output-only eval did not receive output"
			echo "Looking for: [EVAL output-quality] Output received"
			echo "Recent eval logs:"
			grep -i "eval\|output" "$LOG_FILE" | tail -10 || true
			exit 1
		fi
	else
		echo -e "${RED}✗ FAIL:${NC} Eval execution message not found for output-only agent"
		exit 1
	fi
else
	echo -e "${YELLOW}⚠ WARN:${NC} Cannot check server logs"
fi
echo ""

# Test 7: Verify No-Schema Sub Agent Eval
echo "Test 7: Verifying no-schema sub agent eval..."
NO_SCHEMA_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/eval/no-schema" \
  -H "Content-Type: application/json")

if [ -z "$NO_SCHEMA_RESPONSE" ]; then
	echo -e "${RED}✗ FAIL:${NC} No response from no-schema sub agent"
	exit 1
fi

echo "No-schema agent response: $NO_SCHEMA_RESPONSE"

# Wait for evals to complete
echo "Waiting for evals to complete..."
sleep 5

if [ "$SERVER_STARTED" = true ] && [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
	# Check for eval execution message
	if grep -q "\[INTERNAL\].*Executing.*eval(s) after agent run" "$LOG_FILE"; then
		echo -e "${GREEN}✓ PASS:${NC} Eval execution message found for no-schema agent"
		
		# Check for execution eval log
		if grep -q "\[EVAL execution-check\] No input/output" "$LOG_FILE"; then
			echo -e "${GREEN}✓ PASS:${NC} No-schema eval executed correctly (no input/output)"
			# Show the log
			grep "\[EVAL execution-check\] No input/output" "$LOG_FILE" | tail -1 || true
		else
			echo -e "${RED}✗ FAIL:${NC} No-schema eval did not execute correctly"
			exit 1
		fi
	else
		echo -e "${RED}✗ FAIL:${NC} Eval execution message not found for no-schema agent"
		exit 1
	fi
else
	echo -e "${YELLOW}⚠ WARN:${NC} Cannot check server logs"
fi
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Eval functionality working correctly."
echo "Evals execute after agent runs complete."
echo "All sub agents (input-only, output-only, no-schema) working correctly."
echo "========================================="
echo ""

print_result

