#!/bin/bash

# Master Test Runner
# Runs all test scripts in sequence

set -e

BIN_SCRIPT="$(cd "$(dirname "$0")" && pwd)/../../../../packages/cli/bin/cli.ts"

# Check for CI environment (GitHub Actions, etc.)
INTERACTIVE="${INTERACTIVE:-true}"
if [ "$CI" = "true" ]; then
	INTERACTIVE="false"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Cleanup function to kill any orphaned processes
cleanup_orphans() {
	echo ""
	echo -e "${YELLOW}Cleaning up any orphaned processes...${NC}"
	
	# Kill any gravity processes first (they may be holding the port)
	pkill -9 -f gravity 2>/dev/null || true
	
	# Kill any bun dev processes
	pkill -9 -f "bun.*dev" 2>/dev/null || true
	
	# Kill anything on port 3500
	lsof -ti:3500 2>/dev/null | xargs kill -9 2>/dev/null || true
	
	sleep 1
	echo -e "${GREEN}Cleanup complete${NC}"
}

# Trap INT and TERM to ensure cleanup on Ctrl+C
trap cleanup_orphans INT TERM

echo ""
echo "========================================="
echo "  Agentuity Test App - Master Test Suite"
echo "========================================="
echo ""

# Track overall results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0
TESTS_WITH_ORPHANS=()

handle_test_failure() {
	local test_name="$1"
	
	FAILED_TESTS=$((FAILED_TESTS + 1))
	echo -e "${RED}✗ FAILED: $test_name${NC}"
	
	echo ""
	if [ "$INTERACTIVE" = "true" ]; then
		echo -e "${YELLOW}Test failed. Continue with remaining tests? (y/n)${NC}"
		read -r response
		if [[ ! "$response" =~ ^[Yy]$ ]]; then
			echo "Aborting test suite."
			exit 1
		fi
	else
		echo "Aborting test suite."
		exit 1
	fi
}

check_orphaned_processes() {
	local test_name="$1"
	sleep 2  # Give processes time to clean up
	
	# Check for bun processes running dev or gravity
	ORPHANS=$(ps aux | grep -E "(bun.*dev|gravity)" | grep -v grep | grep -v "test.sh" || true)
	
	if [ -n "$ORPHANS" ]; then
		echo -e "${YELLOW}⚠ Orphaned processes detected after $test_name:${NC}"
		echo "$ORPHANS"
		TESTS_WITH_ORPHANS+=("$test_name")
		
		# Kill orphaned processes (gravity first, then bun)
		pkill -9 -f gravity 2>/dev/null || true
		pkill -9 -f "bun.*dev" 2>/dev/null || true
		sleep 1
	fi
	
	# Check if port 3500 is still in use
	if lsof -ti:3500 >/dev/null 2>&1; then
		echo -e "${YELLOW}⚠ Port 3500 still in use after $test_name${NC}"
		if [ -z "$ORPHANS" ]; then
			TESTS_WITH_ORPHANS+=("$test_name (port)")
		fi
		# Clean up port
		lsof -ti:3500 2>/dev/null | xargs kill -9 2>/dev/null || true
		sleep 1
	fi
}

# Function to run a test script
run_test() {
	local test_name="$1"
	local test_script="$2"
	
	TOTAL_TESTS=$((TOTAL_TESTS + 1))
	
	echo ""
	echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	echo -e "${BLUE}Running: $test_name${NC}"
	echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	echo ""
	
	if [[ "$test_script" == *.ts ]]; then
		if bun "$SCRIPT_DIR/$test_script" < /dev/null; then
			PASSED_TESTS=$((PASSED_TESTS + 1))
			echo -e "${GREEN}✓ PASSED: $test_name${NC}"
		else
			handle_test_failure "$test_name"
		fi
	else
		if bash "$SCRIPT_DIR/$test_script" < /dev/null; then
			PASSED_TESTS=$((PASSED_TESTS + 1))
			echo -e "${GREEN}✓ PASSED: $test_name${NC}"
		else
			handle_test_failure "$test_name"
		fi
	fi
	
	# Check for orphaned processes after each test
	check_orphaned_processes "$test_name"
}

# Run all tests
run_test "Server Management" "test-server-management.sh"
run_test "Subagents" "test-subagents.sh"
run_test "Agent Event Listeners" "test-events.sh"
run_test "API Agent Call" "test-api-agent-call.sh"
run_test "WaitUntil" "test-waituntil.sh"
run_test "Binary Storage API" "test-binary-storage.sh"
run_test "Binary Storage Agent" "test-binary-agent.sh"
run_test "KeyValue Storage" "test-keyvalue.sh"
run_test "Vector Storage" "test-vector.sh"
run_test "Stream Storage" "test-stream.sh"
run_test "Eval Functionality" "test-evals.sh"
run_test "Email" "test-email.sh"
# Skip Hot Reload test in CI - rebuilds are slow and file watchers are unreliable in containers
if [ "$CI" != "true" ]; then
	run_test "Hot Reload" "test-dev-reload.sh"
fi
run_test "Build Metadata" "test-build-metadata.ts"

set +e
$BIN_SCRIPT auth whoami &> /dev/null
AUTH_CHECK=$?
set -e
if [ $AUTH_CHECK -eq 0 ]; then
	run_test "Env & Secrets" "test-env-secrets.ts"
	run_test "Deployment Commands" "test-deployment.sh"
else
	echo -e "${RED}Skipping Env & Secrets test since not logged in${NC}"
	echo -e "${RED}Skipping Deployment Commands test since not logged in${NC}"
	SKIPPED_TESTS=$((SKIPPED_TESTS + 2))
fi


# Print summary
echo ""
echo "========================================="
echo "  Authenticated Test Summary"
echo "========================================="
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
if [ $FAILED_TESTS -gt 0 ]; then
	echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
else
	echo -e "Failed:       $FAILED_TESTS"
fi
echo -e "Skipped:      $SKIPPED_TESTS"
echo "========================================="
echo ""

# Report orphaned process issues
if [ ${#TESTS_WITH_ORPHANS[@]} -eq 0 ]; then
	echo -e "${GREEN}✓ No orphaned processes detected${NC}"
else
	echo -e "${YELLOW}⚠ Tests with orphaned processes (${#TESTS_WITH_ORPHANS[@]}):${NC}"
	for test in "${TESTS_WITH_ORPHANS[@]}"; do
		echo "  - $test"
	done
	exit 1
fi
echo ""

# Exit with appropriate code
if [ $FAILED_TESTS -gt 0 ]; then
	echo -e "${RED}Some tests failed!${NC}"
	exit 1
else
	echo -e "${GREEN}All tests passed!${NC}"
	exit 0
fi
