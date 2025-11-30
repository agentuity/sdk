#!/bin/bash

# Shared test library functions
# Source this file from test scripts to reuse common functionality

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default port
PORT="${PORT:-3500}"

# Create temp directory using cross-platform approach
# TMPDIR is set on macOS, use /tmp as fallback for Linux
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/agentuity-test.XXXXXX")

# Track if we started the server
SERVER_STARTED=false
SERVER_PID=""
LOG_TAIL_PID=""

# Enable verbose mode automatically in CI
VERBOSE="${VERBOSE:-false}"
if [ "$CI" = "true" ]; then
	VERBOSE="true"
fi

# Track if any errors occurred
TEST_FAILED=false

# Cleanup function
cleanup() {
	local exit_code=$?
	echo "" 2>/dev/null || true
	echo "Cleaning up..." 2>/dev/null || true
	
	# Stop log tail if running
	if [ -n "$LOG_TAIL_PID" ]; then
		kill "$LOG_TAIL_PID" 2>/dev/null || true
		wait "$LOG_TAIL_PID" 2>/dev/null || true
	fi
	
	# Dump server logs on failure
	if [ $exit_code -ne 0 ] || [ "$TEST_FAILED" = true ]; then
		if [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
			echo ""
			echo -e "${RED}═══════════════════════════════════════════${NC}"
			echo -e "${RED}  Test Failed - Server Logs (last 100 lines)${NC}"
			echo -e "${RED}═══════════════════════════════════════════${NC}"
			tail -n 100 "$LOG_FILE"
			echo -e "${RED}═══════════════════════════════════════════${NC}"
			echo ""
		fi
	fi
	
	# Remove temp directory if set
	if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
		rm -rf "$TEMP_DIR"
	fi
	
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

# Kill a process by PID with graceful shutdown
# Usage: kill_process PID [TIMEOUT_SECONDS]
kill_process() {
	local pid=$1
	local timeout=${2:-5}
	
	if [ -z "$pid" ]; then
		return
	fi
	
	# Check if process exists
	if ! kill -0 "$pid" 2>/dev/null; then
		return
	fi
	
	echo "Killing process (PID: $pid)..."
	
	# Try graceful shutdown with SIGTERM
	kill -TERM "$pid" 2>/dev/null || true
	
	# Wait for graceful shutdown
	local elapsed=0
	while [ $elapsed -lt $timeout ]; do
		if ! kill -0 "$pid" 2>/dev/null; then
			echo "Process terminated gracefully"
			return
		fi
		sleep 1
		elapsed=$((elapsed + 1))
	done
	
	# Force kill if still running
	echo "Process did not terminate gracefully, forcing..."
	kill -9 "$pid" 2>/dev/null || true
	sleep 1
	
	if kill -0 "$pid" 2>/dev/null; then
		echo -e "${YELLOW}Warning:${NC} Process $pid may still be running"
	else
		echo "Process killed"
	fi
}

# Check if server is already running
check_server() {
	local code
	code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/_health 2>/dev/null)
	if [ $? -eq 0 ] && [ "$code" = "200" ]; then
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

# Start server if not already running
# Usage: start_server_if_needed
start_server_if_needed() {
	echo "Checking if server is running on port $PORT..."
	if [ "$(check_server)" != "000" ]; then
		echo -e "${YELLOW}ℹ${NC} Server is already running"
	else
		echo "Starting test server..."
		
		# Get the original test-app directory (script is in test-app/scripts/)
		ORIGINAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
		
		# Check for .env.local first, then fall back to .env in the original project directory
		if [[ -f "$ORIGINAL_DIR/.env.local" && -z "$CI" ]]; then
			ENV_FILE="$ORIGINAL_DIR/.env.local"
		elif [ -f "$ORIGINAL_DIR/.env" ]; then
			ENV_FILE="$ORIGINAL_DIR/.env"
		else
			echo -e "${RED}✗${NC} No .env file found in $ORIGINAL_DIR"
			echo "Please create either .env.local or .env with AGENTUITY_SDK_KEY"
			exit 1
		fi
		
		# Determine which build directory to use based on ISOLATED_BUILD and PORT
		if [ -n "$ISOLATED_BUILD" ] && [ -n "$TEST_BUILD_ROOT" ]; then
			# Use port-specific build directory from /tmp (build-3500, build-3501, etc.)
			BUILD_DIR="$TEST_BUILD_ROOT/build-$PORT"
			if [ ! -f "$BUILD_DIR/app.js" ]; then
				echo -e "${RED}✗${NC} Built app not found at $BUILD_DIR/app.js"
				echo "Please run build script to create port-specific builds"
				exit 1
			fi
			echo "Using isolated build directory: $BUILD_DIR"
			echo "Using env file: $ENV_FILE"
		else
			BUILD_DIR="$ORIGINAL_DIR/.agentuity"
			if ! cd "$ORIGINAL_DIR"; then
				echo -e "${RED}✗${NC} Failed to change directory to $ORIGINAL_DIR"
				exit 1
			fi
		fi
		
		echo "Using PORT: $PORT"
		echo "Using ENV_FILE: $ENV_FILE"
		
		# Start server in background, redirecting output to temp log
		LOG_FILE="$TEMP_DIR/server.log"
		
		# Check if we should use dev mode (for hot reload tests) or built app
		if [ "$USE_DEV_MODE" = "true" ]; then
			# Use dev command (with file watching and rebuilding)
			echo "Starting in dev mode with hot reload..."
			env bun run --env-file $ENV_FILE dev -- --no-public --port $PORT > "$LOG_FILE" 2>&1 &
		else
			# Run the pre-built app directly (--dev build has config baked in)
			echo "Running pre-built app from $BUILD_DIR..."
			echo "Command: PORT=$PORT bun --env-file=$ENV_FILE $BUILD_DIR/app.js"
			PORT=$PORT bun --env-file=$ENV_FILE "$BUILD_DIR/app.js" > "$LOG_FILE" 2>&1 &
		fi
		
		SERVER_PID=$!
		SERVER_STARTED=true
		
		echo "Server starting on port $PORT (PID: $SERVER_PID, log: $LOG_FILE)..."
		
		# In verbose mode (CI or VERBOSE=true), tail logs in real-time
		if [ "$VERBOSE" = "true" ]; then
			echo ""
			echo -e "${BLUE}═══════════════════════════════════════════${NC}"
			echo -e "${BLUE}  Real-time Server Logs (verbose mode)${NC}"
			echo -e "${BLUE}═══════════════════════════════════════════${NC}"
			tail -f "$LOG_FILE" &
			LOG_TAIL_PID=$!
			echo ""
		fi
		
		# Wait for server to be ready
		if ! wait_for_server; then
			TEST_FAILED=true
			echo "Server logs:"
			cat "$LOG_FILE"
			exit 1
		fi
	fi
	echo ""
}

# Cross-platform SHA256 hash calculation
# Tries sha256sum (Linux) first, falls back to shasum (macOS)
sha256() {
	if command -v sha256sum &> /dev/null; then
		sha256sum | awk '{print $1}'
	elif command -v shasum &> /dev/null; then
		shasum -a 256 | awk '{print $1}'
	else
		echo "Error: Neither sha256sum nor shasum found" >&2
		return 1
	fi
}

# Cross-platform base64 decode
# Tries different base64 decode flags: --decode (Linux), -d (macOS/Linux), -D (some systems)
b64decode() {
	if base64 --decode <<< "" &> /dev/null 2>&1; then
		base64 --decode
	elif base64 -d <<< "" &> /dev/null 2>&1; then
		base64 -d
	elif base64 -D <<< "" &> /dev/null 2>&1; then
		base64 -D
	else
		echo "Error: No compatible base64 decode option found" >&2
		return 1
	fi
}

# Print test result message
print_result() {
	if [ "$SERVER_STARTED" = true ]; then
		echo -e "${YELLOW}Note:${NC} Server was started by this script and will be stopped on exit"
	else
		echo -e "${YELLOW}Note:${NC} Server was already running and will remain running"
	fi
}
