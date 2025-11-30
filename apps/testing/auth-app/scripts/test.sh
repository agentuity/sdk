#!/bin/bash

# Master Test Runner (Optimized with Parallel Execution)
# Runs test scripts in parallel groups for faster execution

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
echo "  (Optimized with Parallel Execution)"
echo "========================================="
echo ""

# Track overall results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0
TESTS_WITH_ORPHANS=()

# Track test durations (name:duration pairs)
TEST_DURATIONS=""

handle_test_failure() {
	local test_name="$1"
	
	FAILED_TESTS=$((FAILED_TESTS + 1))
	echo -e "${RED}✗ FAILED: $test_name${NC}"
	echo "Aborting test suite."
	exit 1
}

# Function to run a test script
run_test() {
	local test_name="$1"
	local test_script="$2"
	
	TOTAL_TESTS=$((TOTAL_TESTS + 1))
	
	local start_time=$SECONDS
	
	echo ""
	echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	echo -e "${BLUE}Running: $test_name${NC}"
	echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	echo ""
	
	# Check if we should skip stdin redirect (needed for tests that use stdin)
	local stdin_redirect=""
	if [ "$SKIP_STDIN_REDIRECT" != "true" ]; then
		stdin_redirect="< /dev/null"
	fi
	
	if [[ "$test_script" == *.ts ]]; then
		if eval "bun '$SCRIPT_DIR/$test_script' $stdin_redirect"; then
			PASSED_TESTS=$((PASSED_TESTS + 1))
			local duration=$((SECONDS - start_time))
			TEST_DURATIONS="${TEST_DURATIONS}${test_name}:${duration};"
			echo -e "${GREEN}✓ PASSED: $test_name (${duration}s)${NC}"
		else
			handle_test_failure "$test_name"
		fi
	else
		if eval "bash '$SCRIPT_DIR/$test_script' $stdin_redirect"; then
			PASSED_TESTS=$((PASSED_TESTS + 1))
			local duration=$((SECONDS - start_time))
			TEST_DURATIONS="${TEST_DURATIONS}${test_name}:${duration};"
			echo -e "${GREEN}✓ PASSED: $test_name (${duration}s)${NC}"
		else
			handle_test_failure "$test_name"
		fi
	fi
}

# Function to run a group of tests in parallel (each on its own port)
run_parallel_group() {
	local group_name="$1"
	shift
	local tests=("$@")
	
	echo ""
	echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
	echo -e "${YELLOW}  Test Group: $group_name (Parallel)${NC}"
	echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
	
	local pids=()
	local test_names=()
	local group_start=$SECONDS
	
	# Create temp directory for results
	local results_dir=$(mktemp -d)
	
	# Start all tests in parallel, each on a different port
	local port_offset=0
	for test_spec in "${tests[@]}"; do
		local test_name="${test_spec%%:*}"
		local test_script="${test_spec#*:}"
		
		TOTAL_TESTS=$((TOTAL_TESTS + 1))
		test_names+=("$test_name")
		
		# Assign unique port for this test (3500, 3501, 3502, etc.)
		local test_port=$((3500 + port_offset))
		port_offset=$((port_offset + 1))
		
		(
			local test_start=$SECONDS
			local result_file="$results_dir/$(echo "$test_name" | tr ' ' '_').result"
			
			echo ""
			echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
			echo -e "${BLUE}Running: $test_name (port $test_port)${NC}"
			echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
			echo ""
			
			# Export PORT and ISOLATED_BUILD for this test (built app will be used)
			export PORT=$test_port
			export ISOLATED_BUILD=true
			
			if [[ "$test_script" == *.ts ]]; then
				if bun "$SCRIPT_DIR/$test_script" < /dev/null; then
					local test_duration=$((SECONDS - test_start))
					echo "$test_duration" > "$result_file"
					exit 0
				else
					exit 1
				fi
			else
				if bash "$SCRIPT_DIR/$test_script" < /dev/null; then
					local test_duration=$((SECONDS - test_start))
					echo "$test_duration" > "$result_file"
					exit 0
				else
					exit 1
				fi
			fi
		) &
		
		pids+=($!)
	done
	
	# Wait for all tests and collect results
	local failed_in_group=0
	for i in "${!pids[@]}"; do
		local pid=${pids[$i]}
		local test_name=${test_names[$i]}
		local result_file="$results_dir/$(echo "$test_name" | tr ' ' '_').result"
		
		if wait $pid; then
			local duration=0
			if [ -f "$result_file" ]; then
				duration=$(cat "$result_file")
			fi
			PASSED_TESTS=$((PASSED_TESTS + 1))
			TEST_DURATIONS="${TEST_DURATIONS}${test_name}:${duration};"
			echo -e "${GREEN}✓ PASSED: $test_name (${duration}s)${NC}"
		else
			FAILED_TESTS=$((FAILED_TESTS + 1))
			failed_in_group=$((failed_in_group + 1))
			echo -e "${RED}✗ FAILED: $test_name${NC}"
		fi
	done
	
	# Cleanup results directory
	rm -rf "$results_dir"
	
	local group_duration=$((SECONDS - group_start))
	echo -e "${YELLOW}Group completed in ${group_duration}s${NC}"
	
	# Abort on any failures
	if [ $failed_in_group -gt 0 ]; then
		echo "Aborting test suite due to failures."
		exit 1
	fi
}

# Clean up before starting
cleanup_orphans

# ============================================================================
# Build to multiple output directories for parallel execution
# ============================================================================
echo ""
echo -e "${YELLOW}Building project to multiple output directories for parallel tests...${NC}"
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

# Build to 10 different output directories OUTSIDE the project to avoid scanner conflicts
# Run builds in parallel for speed
BUILD_ROOT="/tmp/agentuity-test-builds-$$"
rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT"

for i in {0..9}; do
	OUTDIR="$BUILD_ROOT/build-350$i"
	bun run build --outdir "$OUTDIR" --skip-type-check --dev > /dev/null 2>&1 &
done

# Wait for all builds to complete
wait

# Verify builds succeeded
for i in {0..9}; do
	OUTDIR="$BUILD_ROOT/build-350$i"
	if [ ! -f "$OUTDIR/app.js" ]; then
		echo -e "${RED}✗ Build failed for $OUTDIR${NC}"
		exit 1
	fi
done

# Store build root for cleanup
export TEST_BUILD_ROOT="$BUILD_ROOT"

echo -e "${GREEN}✓ All builds complete - ready for parallel execution${NC}"
echo ""

# ============================================================================
# GROUP 1: Server Management (Serial - must run first)
# ============================================================================
run_test "Server Management" "test-server-management.sh"

# ============================================================================
# GROUP 2: Storage Tests (Parallel - each on own port)
# ============================================================================
run_parallel_group "Storage Tests" \
	"KeyValue Storage:test-keyvalue.sh" \
	"Vector Storage:test-vector.sh" \
	"Stream Storage:test-stream.sh" \
	"Binary Storage API:test-binary-storage.sh"

# Binary Storage Agent has race condition with 5 parallel tests - run serially with isolated build
ISOLATED_BUILD=true PORT=3500 TEST_BUILD_ROOT="$BUILD_ROOT" run_test "Binary Storage Agent" "test-binary-agent.sh"

# ============================================================================
# GROUP 3: Feature Tests (Parallel - each on own port)
# ============================================================================
run_parallel_group "Feature Tests" \
	"Subagents:test-subagents.sh" \
	"Agent Event Listeners:test-events.sh" \
	"API Agent Call:test-api-agent-call.sh" \
	"WaitUntil:test-waituntil.sh" \
	"Eval Functionality:test-evals.sh" \
	"Email:test-email.sh"

# ============================================================================
# GROUP 4: Misc Tests (Can run in parallel or serial)
# ============================================================================
# Skip Hot Reload test in CI - rebuilds are slow and file watchers are unreliable in containers
if [ "$CI" != "true" ]; then
	# Hot reload test needs dev mode enabled - run serially since it modifies source files
	USE_DEV_MODE=true run_test "Hot Reload" "test-dev-reload.sh"
fi

# Build Metadata test is quick and doesn't conflict
run_test "Build Metadata" "test-build-metadata.ts"

# ============================================================================
# GROUP 6: Authenticated Tests
# ============================================================================
set +e
$BIN_SCRIPT auth whoami &> /dev/null
AUTH_CHECK=$?
set -e

if [ $AUTH_CHECK -eq 0 ]; then
	# Deployment is slow, run it separately
	run_test "Deployment Commands" "test-deployment.sh"
	
	# Other CLI tests in parallel
	run_parallel_group "CLI Tests (Authenticated)" \
		"Env & Secrets:test-env-secrets.ts" \
		"API Key Commands:test-apikey.sh" \
		"Vector CLI Commands:test-vector-cli.sh"
	
	# Database and Storage tests run serially
	if [ "$CI" != "true" ]; then
		run_test "Database Resource Commands" "test-db.sh"
	fi
	
	# Storage test - works in CI but fails locally due to DNS resolution issue with local region
	# Error when local: "unable to resolve dns name ag-xxx-local.agentuity.io.internal"
	if [ "$CI" = "true" ]; then
		run_test "Storage Resource Commands" "test-storage.sh"
	else
		echo -e "${YELLOW}Skipping Storage test (local region DNS issue - works in CI)${NC}"
		SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
	fi
else
	echo -e "${RED}Skipping authenticated tests (not logged in)${NC}"
	SKIPPED_TESTS=$((SKIPPED_TESTS + 6))
fi

# Print summary
echo ""
echo "========================================="
echo "  Test Summary"
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

# Print timing breakdown
echo "========================================="
echo "  Test Durations"
echo "========================================="
if [ -n "$TEST_DURATIONS" ]; then
	echo "$TEST_DURATIONS" | tr ';' '\n' | grep -v '^$' | while IFS=: read -r name duration; do
		echo "  $name: ${duration}s"
	done | sort -t: -k2 -n
fi
echo "========================================="
echo ""

# Stop shared server if it was started
if [ -n "$SHARED_SERVER_PID" ]; then
	echo ""
	echo -e "${YELLOW}Stopping shared test server (PID: $SHARED_SERVER_PID)...${NC}"
	kill "$SHARED_SERVER_PID" 2>/dev/null || true
	wait "$SHARED_SERVER_PID" 2>/dev/null || true
	echo -e "${GREEN}✓ Shared server stopped${NC}"
fi

# Cleanup build directories
if [ -n "$TEST_BUILD_ROOT" ] && [ -d "$TEST_BUILD_ROOT" ]; then
	echo ""
	echo -e "${YELLOW}Cleaning up build directories...${NC}"
	rm -rf "$TEST_BUILD_ROOT"
	echo -e "${GREEN}✓ Build directories removed${NC}"
fi

# Final cleanup check
cleanup_orphans

# Exit with appropriate code
if [ $FAILED_TESTS -gt 0 ]; then
	echo -e "${RED}Some tests failed!${NC}"
	exit 1
else
	echo -e "${GREEN}All tests passed!${NC}"
	exit 0
fi
