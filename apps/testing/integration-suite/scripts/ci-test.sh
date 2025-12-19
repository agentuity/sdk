#!/bin/bash
# CI test runner for integration suite
# Runs all tests against production Catalyst API

set -e

# Cleanup .env file on exit (regardless of success/failure)
trap 'rm -f "$APP_DIR/.agentuity/.env"' EXIT

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT=3500
TIMEOUT=60

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "==================================="
echo "Integration Suite - CI Test Runner"
echo "==================================="
echo ""

# Load .env.local if it exists and AGENTUITY_SDK_KEY is not already set
if [ -z "$AGENTUITY_SDK_KEY" ] && [ -f "$APP_DIR/.env.local" ]; then
	echo -e "${YELLOW}ℹ${NC} Loading environment from .env.local for local development"
	export $(grep -v '^#' "$APP_DIR/.env.local" | xargs)
fi

# Check for required secrets
if [ -z "$AGENTUITY_SDK_KEY" ]; then
	echo -e "${RED}✗ ERROR:${NC} AGENTUITY_SDK_KEY not found"
	echo "For local development, create .env.local with AGENTUITY_SDK_KEY"
	echo "For CI, configure AGENTUITY_SDK_KEY as a GitHub Actions secret"
	exit 1
fi

echo -e "${GREEN}✓${NC} API key configured"

# Build SDK packages first (required for integration suite)
if [ "$SKIP_SDK_BUILD" != "true" ]; then
	echo ""
	echo "Building SDK packages..."
	cd "$APP_DIR/../../.."
	bun run build
	echo -e "${GREEN}✓${NC} SDK packages built"
else
	echo ""
	echo "Skipping SDK build (already built in CI)"
fi

# Build the app
echo ""
echo "Building integration suite..."
cd "$APP_DIR"
bun run build

# Copy web dashboard (CLI doesn't copy this in dev mode)
mkdir -p .agentuity/web
cp src/web/index.html .agentuity/web/

echo -e "${GREEN}✓${NC} Build complete"

# Create .env file AFTER build (build clears .agentuity directory)
# This overwrites the .env.local copy with CI/test credentials
echo "AGENTUITY_SDK_KEY=$AGENTUITY_SDK_KEY" > "$APP_DIR/.agentuity/.env"

# Set region (use environment variable if set, otherwise default to local for dev)
REGION="${AGENTUITY_REGION:-local}"
echo "AGENTUITY_REGION=$REGION" >> "$APP_DIR/.agentuity/.env"

# Add OpenAI API key if available (required for vector embedding operations)
if [ -n "$OPENAI_API_KEY" ]; then
        echo "OPENAI_API_KEY=$OPENAI_API_KEY" >> "$APP_DIR/.agentuity/.env"
        echo -e "${GREEN}✓${NC} OpenAI API key configured for vector operations"
fi

echo -e "${GREEN}✓${NC} Environment configured (region: $REGION)"

# Set service URLs based on region (required for LLM patching)
# This mirrors what dev mode does in dev/index.ts - uses getServiceUrls() from @agentuity/server
echo "Computing service URLs for region: $REGION"
eval "$(bun "$SCRIPT_DIR/get-service-urls.ts")"
echo -e "${GREEN}✓${NC} Service URLs configured: $AGENTUITY_TRANSPORT_URL"

# Start server in background
echo ""
echo "Starting test server on port $PORT..."
cd "$APP_DIR/.agentuity"
LOG_FILE="/tmp/integration-suite.log"
bun run app.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
echo "Logs: $LOG_FILE"

# Give server a moment to crash if there's a startup error
sleep 2
if ! ps -p $SERVER_PID > /dev/null 2>&1; then
	echo -e "${RED}✗ ERROR:${NC} Server crashed immediately after startup"
	echo ""
	echo "Server logs:"
	cat "$LOG_FILE"
	exit 1
fi

# Wait for server to be ready
echo "Waiting for server health check..."
ATTEMPTS=0
while [ $ATTEMPTS -lt $TIMEOUT ]; do
	if curl -s -f "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
		echo -e "${GREEN}✓${NC} Server is ready"
		break
	fi
	sleep 1
	ATTEMPTS=$((ATTEMPTS + 1))
done

if [ $ATTEMPTS -eq $TIMEOUT ]; then
	echo -e "${RED}✗ ERROR:${NC} Server failed to start within ${TIMEOUT}s"
	echo ""
	echo "Server logs:"
	tail -50 /tmp/integration-suite.log
	kill $SERVER_PID 2>/dev/null || true
	exit 1
fi

# Run tests via SSE endpoint
echo ""
echo "Running all tests (concurrency=10)..."
echo ""

# Parse SSE stream and track results
TOTAL=0
PASSED=0
FAILED=0
DURATION=0

curl -s "http://127.0.0.1:$PORT/api/test/run?concurrency=10" | while IFS= read -r line; do
	# Skip empty lines
	[ -z "$line" ] && continue
	
	# Parse event type
	if [[ "$line" =~ ^event:\ (.*)$ ]]; then
		EVENT="${BASH_REMATCH[1]}"
		continue
	fi
	
	# Parse data
	if [[ "$line" =~ ^data:\ (.*)$ ]]; then
		DATA="${BASH_REMATCH[1]}"
		
		# Extract test result
		if echo "$DATA" | grep -q '"type":"progress"'; then
			TEST_NAME=$(echo "$DATA" | grep -o '"test":"[^"]*"' | cut -d'"' -f4)
			PASSED_FLAG=$(echo "$DATA" | grep -o '"passed":[^,}]*' | cut -d':' -f2)
			
			if [ "$PASSED_FLAG" = "true" ]; then
				echo -e "${GREEN}✓${NC} $TEST_NAME"
			else
				echo -e "${RED}✗${NC} $TEST_NAME"
				ERROR=$(echo "$DATA" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 | head -c 100)
				if [ -n "$ERROR" ]; then
					echo "  Error: $ERROR"
				fi
			fi
		fi
		
		# Extract summary
		if echo "$DATA" | grep -q '"type":"complete"'; then
			TOTAL=$(echo "$DATA" | grep -o '"total":[0-9]*' | cut -d':' -f2)
			PASSED=$(echo "$DATA" | grep -o '"passed":[0-9]*' | cut -d':' -f2)
			FAILED=$(echo "$DATA" | grep -o '"failed":[0-9]*' | cut -d':' -f2)
			DURATION=$(echo "$DATA" | grep -o '"duration":[0-9.]*' | cut -d':' -f2)
			
			# Calculate duration in seconds
			DURATION_SEC=$(echo "scale=2; $DURATION / 1000" | bc)
			
			echo ""
			echo "╔════════════════════════════════════════════════════════════════╗"
			echo "║              INTEGRATION SUITE - TEST RESULTS                  ║"
			echo "╠════════════════════════════════════════════════════════════════╣"
			printf "║  %-30s %30s  ║\n" "Total Tests:" "$TOTAL"
			printf "║  %-30s %30s  ║\n" "Passed:" "$(printf "${GREEN}%s${NC}" "$PASSED")"
			printf "║  %-30s %30s  ║\n" "Failed:" "$(printf "${RED}%s${NC}" "$FAILED")"
			printf "║  %-30s %30s  ║\n" "Duration:" "${DURATION_SEC}s (${DURATION}ms)"
			echo "╠════════════════════════════════════════════════════════════════╣"
			
			if [ "$FAILED" -gt 0 ]; then
				printf "║  %-60s  ║\n" "$(printf "${RED}✗ RESULT: FAILED - %s test(s) failed${NC}" "$FAILED")"
			else
				printf "║  %-60s  ║\n" "$(printf "${GREEN}✓ RESULT: SUCCESS - All tests passed${NC}")"
			fi
			
			echo "╚════════════════════════════════════════════════════════════════╝"
			echo ""
			
			# Kill server
			kill $SERVER_PID 2>/dev/null || true
			
			# Exit with failure if any tests failed
			if [ "$FAILED" -gt 0 ]; then
				exit 1
			else
				exit 0
			fi
		fi
	fi
done

# Cleanup (in case curl fails)
kill $SERVER_PID 2>/dev/null || true
