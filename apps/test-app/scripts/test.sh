#!/bin/bash

# Master Test Runner
# Runs all test scripts in sequence

set -e

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

echo ""
echo "========================================="
echo "  Agentuity Test App - Master Test Suite"
echo "========================================="
echo ""

# Track overall results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

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
	
	if bash "$SCRIPT_DIR/$test_script"; then
		PASSED_TESTS=$((PASSED_TESTS + 1))
		echo -e "${GREEN}✓ PASSED: $test_name${NC}"
	else
		FAILED_TESTS=$((FAILED_TESTS + 1))
		echo -e "${RED}✗ FAILED: $test_name${NC}"
		
		# If one test fails, ask whether to continue
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
	fi
}

# Run all tests
run_test "Server Management" "test-server-management.sh"
run_test "Binary Storage API" "test-binary-storage.sh"
run_test "Binary Storage Agent" "test-binary-agent.sh"
run_test "KeyValue Storage" "test-keyvalue.sh"
run_test "Vector Storage" "test-vector.sh"
run_test "Stream Storage" "test-stream.sh"
run_test "Hot Reload" "test-dev-reload.sh"

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
echo "========================================="
echo ""

# Exit with appropriate code
if [ $FAILED_TESTS -gt 0 ]; then
	echo -e "${RED}Some tests failed!${NC}"
	exit 1
else
	echo -e "${GREEN}All tests passed!${NC}"
	exit 0
fi
