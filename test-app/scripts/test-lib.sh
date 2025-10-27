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
PORT="${PORT:-3000}"

# Track if we started the server
SERVER_STARTED=false
SERVER_PID=""

# Cleanup function
cleanup() {
	echo ""
	echo "Cleaning up..."
	
	# Remove temp directory if set
	if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
		rm -rf "$TEMP_DIR"
	fi
	
	# Stop server if we started it
	if [ "$SERVER_STARTED" = true ] && [ -n "$SERVER_PID" ]; then
		echo "Stopping test server (PID: $SERVER_PID)..."
		kill $SERVER_PID 2>/dev/null || true
		wait $SERVER_PID 2>/dev/null || true
		echo -e "${GREEN}✓${NC} Server stopped"
	fi
}

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

# Start server if not already running
# Usage: start_server_if_needed
start_server_if_needed() {
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
		LOG_FILE="$TEMP_DIR/server.log"
		bun run dev > "$LOG_FILE" 2>&1 &
		SERVER_PID=$!
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
}

# Print test result message
print_result() {
	if [ "$SERVER_STARTED" = true ]; then
		echo -e "${YELLOW}Note:${NC} Server was started by this script and will be stopped on exit"
	else
		echo -e "${YELLOW}Note:${NC} Server was already running and will remain running"
	fi
}
