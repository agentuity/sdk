#!/usr/bin/env bash

# Test script for env and secret CLI commands
# Tests all operations against the auth-app test project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLI_PATH="$SCRIPT_DIR/../../../packages/cli/bin/cli.ts"

# Unique test keys to avoid conflicts
ENV_TEST_KEY1="CLI_TEST_ENV_VAR_$(date +%s)_A"
ENV_TEST_KEY2="CLI_TEST_ENV_VAR_$(date +%s)_B"
SECRET_TEST_KEY1="CLI_TEST_SECRET_$(date +%s)_X"
SECRET_TEST_KEY2="CLI_TEST_SECRET_$(date +%s)_Y"

TEST_VALUE1="test_value_1"
TEST_VALUE2="test_value_2"
UPDATED_VALUE="updated_value"

# Track test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run a test
run_test() {
	local test_name="$1"
	local test_command="$2"
	
	TESTS_RUN=$((TESTS_RUN + 1))
	echo -e "${YELLOW}[TEST $TESTS_RUN]${NC} $test_name"
	
	if eval "$test_command"; then
		echo -e "${GREEN}✓ PASSED${NC}\n"
		TESTS_PASSED=$((TESTS_PASSED + 1))
		return 0
	else
		echo -e "${RED}✗ FAILED${NC}\n"
		TESTS_FAILED=$((TESTS_FAILED + 1))
		return 1
	fi
}

# Helper to check if output contains expected value
check_output() {
	local output="$1"
	local expected="$2"
	
	if echo "$output" | grep -q "$expected"; then
		return 0
	else
		echo "Expected output to contain: $expected"
		echo "Got: $output"
		return 1
	fi
}

echo "========================================="
echo "  Environment & Secrets CLI Test Suite"
echo "========================================="
echo ""
echo "Project: $PROJECT_DIR"
echo "Test Keys:"
echo "  ENV:    $ENV_TEST_KEY1, $ENV_TEST_KEY2"
echo "  SECRET: $SECRET_TEST_KEY1, $SECRET_TEST_KEY2"
echo ""

# ============================================================================
# ENVIRONMENT VARIABLE TESTS
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing: Environment Variables"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test: env set
run_test "env set $ENV_TEST_KEY1" \
	"$CLI_PATH env set $ENV_TEST_KEY1 $TEST_VALUE1 --dir $PROJECT_DIR 2>&1 | grep -q 'successfully'"

# Test: env get
run_test "env get $ENV_TEST_KEY1" \
	"output=\$($CLI_PATH env get $ENV_TEST_KEY1 --dir $PROJECT_DIR 2>&1); check_output \"\$output\" \"$TEST_VALUE1\""

# Test: env set another
run_test "env set $ENV_TEST_KEY2" \
	"$CLI_PATH env set $ENV_TEST_KEY2 $TEST_VALUE2 --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: env list (should show both)
run_test "env list shows both keys" \
	"output=\$($CLI_PATH env list --dir $PROJECT_DIR --no-masked 2>&1); check_output \"\$output\" \"$ENV_TEST_KEY1\" && check_output \"\$output\" \"$ENV_TEST_KEY2\""

# Test: env list with masking
run_test "env list with --masked" \
	"output=\$($CLI_PATH env list --dir $PROJECT_DIR --masked 2>&1); check_output \"\$output\" \"...\""

# Test: env push (should sync local to cloud)
run_test "env push" \
	"$CLI_PATH env push --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: env pull
run_test "env pull" \
	"$CLI_PATH env pull --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: Check .env.production exists and contains our keys
run_test ".env.production exists with test keys" \
	"test -f $PROJECT_DIR/.env.production && grep -q \"$ENV_TEST_KEY1\" $PROJECT_DIR/.env.production"

# Test: Check .env still has AGENTUITY_SDK_KEY
run_test ".env preserves AGENTUITY_SDK_KEY" \
	"test -f $PROJECT_DIR/.env && grep -q \"AGENTUITY_SDK_KEY\" $PROJECT_DIR/.env"

# Test: env delete one key
run_test "env delete $ENV_TEST_KEY2" \
	"$CLI_PATH env delete $ENV_TEST_KEY2 --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: Verify deletion
run_test "verify $ENV_TEST_KEY2 is deleted" \
	"! $CLI_PATH env get $ENV_TEST_KEY2 --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: env delete cleanup
run_test "cleanup: delete $ENV_TEST_KEY1" \
	"$CLI_PATH env delete $ENV_TEST_KEY1 --dir $PROJECT_DIR > /dev/null 2>&1"

# ============================================================================
# SECRET TESTS
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing: Secrets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test: secret set
run_test "secret set $SECRET_TEST_KEY1" \
	"$CLI_PATH secret set $SECRET_TEST_KEY1 $TEST_VALUE1 --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: secret get with masking (default)
run_test "secret get $SECRET_TEST_KEY1 (masked)" \
	"output=\$($CLI_PATH secret get $SECRET_TEST_KEY1 --dir $PROJECT_DIR 2>&1); check_output \"\$output\" \"...\""

# Test: secret get without masking
run_test "secret get $SECRET_TEST_KEY1 (unmasked)" \
	"output=\$($CLI_PATH secret get $SECRET_TEST_KEY1 --dir $PROJECT_DIR --no-masked 2>&1); check_output \"\$output\" \"$TEST_VALUE1\""

# Test: secret set another
run_test "secret set $SECRET_TEST_KEY2" \
	"$CLI_PATH secret set $SECRET_TEST_KEY2 $TEST_VALUE2 --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: secret list (should show both, masked by default)
run_test "secret list shows both keys (masked)" \
	"output=\$($CLI_PATH secret list --dir $PROJECT_DIR 2>&1); check_output \"\$output\" \"$SECRET_TEST_KEY1\" && check_output \"\$output\" \"$SECRET_TEST_KEY2\""

# Test: secret list without masking
run_test "secret list (unmasked)" \
	"output=\$($CLI_PATH secret list --dir $PROJECT_DIR --no-masked 2>&1); check_output \"\$output\" \"$TEST_VALUE1\" && check_output \"\$output\" \"$TEST_VALUE2\""

# Test: secret push
run_test "secret push" \
	"$CLI_PATH secret push --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: secret pull
run_test "secret pull" \
	"$CLI_PATH secret pull --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: secret delete one key
run_test "secret delete $SECRET_TEST_KEY2" \
	"$CLI_PATH secret delete $SECRET_TEST_KEY2 --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: Verify secret deletion
run_test "verify $SECRET_TEST_KEY2 is deleted" \
	"! $CLI_PATH secret get $SECRET_TEST_KEY2 --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: secret delete cleanup
run_test "cleanup: delete $SECRET_TEST_KEY1" \
	"$CLI_PATH secret delete $SECRET_TEST_KEY1 --dir $PROJECT_DIR > /dev/null 2>&1"

# ============================================================================
# IMPORT/EXPORT TESTS
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing: Import/Export"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create a test import file
IMPORT_FILE="$PROJECT_DIR/.test-import.env"
ENV_IMPORT_KEY="CLI_TEST_IMPORT_$(date +%s)"
cat > "$IMPORT_FILE" <<EOF
$ENV_IMPORT_KEY=imported_value
TEST_IMPORT_2=value2
EOF

# Test: env import
run_test "env import from file" \
	"$CLI_PATH env import $IMPORT_FILE --dir $PROJECT_DIR > /dev/null 2>&1"

# Test: Verify imported key exists
run_test "verify imported key exists" \
	"output=\$($CLI_PATH env get $ENV_IMPORT_KEY --dir $PROJECT_DIR 2>&1); check_output \"\$output\" \"imported_value\""

# Cleanup imported keys
run_test "cleanup: delete imported keys" \
	"$CLI_PATH env delete $ENV_IMPORT_KEY --dir $PROJECT_DIR > /dev/null 2>&1 && $CLI_PATH env delete TEST_IMPORT_2 --dir $PROJECT_DIR > /dev/null 2>&1"

# Cleanup import file
rm -f "$IMPORT_FILE"

# ============================================================================
# SUMMARY
# ============================================================================

echo "========================================="
echo "  Test Results"
echo "========================================="
echo "Total Tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
	echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
else
	echo "Failed:       $TESTS_FAILED"
fi
echo "========================================="
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
	echo -e "${GREEN}✓ All tests passed!${NC}"
	exit 0
else
	echo -e "${RED}✗ Some tests failed${NC}"
	exit 1
fi
