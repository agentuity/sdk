#!/bin/bash

# API Key CLI Test Script
# Tests CRUD operations for API keys using the CLI

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

BIN_SCRIPT="$SCRIPT_DIR/../../../../packages/cli/bin/cli.ts"

echo "========================================="
echo "  API Key CLI Test"
echo "========================================="
echo ""

# Generate unique name for this test run to avoid collisions
TEST_RUN_ID="test-apikey-$(date +%s)"
API_KEY_NAME="${TEST_RUN_ID}"
echo "Test Run ID: $TEST_RUN_ID"
echo ""

# Create temp directory for test artifacts
TEMP_DIR=$(mktemp -d)
echo "Test directory: $TEMP_DIR"
echo ""

# Cleanup function
cleanup() {
	local exit_code=$?
	echo "" 2>/dev/null || true
	echo "Cleaning up..." 2>/dev/null || true
	
	# Remove temp directory if set
	if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
		rm -rf "$TEMP_DIR"
	fi
	
	if [ $exit_code -ne 0 ] || [ "$TEST_FAILED" = true ]; then
		echo -e "${RED}✗${NC} API Key test failed"
		exit 1
	fi
}

trap cleanup EXIT INT TERM

# Change to test-app directory (for project context)
cd "$SCRIPT_DIR/.."

# Check if user is authenticated
echo "Checking authentication..."
set +e
bun "$BIN_SCRIPT" auth whoami &> /dev/null
AUTH_CHECK=$?
set -e

if [ $AUTH_CHECK -ne 0 ]; then
	echo -e "${RED}✗${NC} Not authenticated. Please run: bun $BIN_SCRIPT auth login"
	TEST_FAILED=true
	exit 1
fi
echo -e "${GREEN}✓${NC} Authenticated"
echo ""

# Check if project exists (agentuity.json file)
if [ ! -f "agentuity.json" ]; then
	echo -e "${RED}✗${NC} No agentuity.json file found. This test must be run from a project directory."
	TEST_FAILED=true
	exit 1
fi
echo -e "${GREEN}✓${NC} Project configuration found"
echo ""

# Test 1: List existing API keys
echo "Test 1: List existing API keys..."
LIST_OUTPUT="$TEMP_DIR/list.txt"
set +e
bun "$BIN_SCRIPT" cloud apikey list --json > "$LIST_OUTPUT" 2>&1
LIST_EXIT=$?
set -e

if [ $LIST_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} List API keys command succeeded"
	INITIAL_COUNT=$(cat "$LIST_OUTPUT" | jq 'length')
	echo "Initial API key count: $INITIAL_COUNT"
else
	echo -e "${RED}✗${NC} List API keys command failed"
	cat "$LIST_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Test 2: Create a new API key
echo "Test 2: Create a new API key..."
# Set expiration to 1 year from now
EXPIRES_AT=$(date -u -d "+1 year" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+1y +"%Y-%m-%dT%H:%M:%SZ")
CREATE_OUTPUT="$TEMP_DIR/create.txt"

echo "Creating API key with name: $API_KEY_NAME"
echo "Expires at: $EXPIRES_AT"

set +e
bun "$BIN_SCRIPT" cloud apikey create --name "$API_KEY_NAME" --expires-at "$EXPIRES_AT" --confirm --json > "$CREATE_OUTPUT" 2>&1
CREATE_EXIT=$?
set -e

if [ $CREATE_EXIT -ne 0 ]; then
	echo -e "${RED}✗${NC} Create API key command failed"
	cat "$CREATE_OUTPUT"
	TEST_FAILED=true
	exit 1
fi

echo -e "${GREEN}✓${NC} Create API key command succeeded"

# Extract the API key ID from the response
API_KEY_ID=$(cat "$CREATE_OUTPUT" | jq -r '.id')
API_KEY_VALUE=$(cat "$CREATE_OUTPUT" | jq -r '.value')

if [ -z "$API_KEY_ID" ] || [ "$API_KEY_ID" = "null" ]; then
	echo -e "${RED}✗${NC} Failed to extract API key ID from response"
	cat "$CREATE_OUTPUT"
	TEST_FAILED=true
	exit 1
fi

echo "Created API key ID: $API_KEY_ID"
echo "API key value starts with: ${API_KEY_VALUE:0:10}..."
echo ""

# Test 3: Verify the new API key appears in the list
echo "Test 3: Verify new API key appears in list..."
LIST_OUTPUT2="$TEMP_DIR/list2.txt"
set +e
bun "$BIN_SCRIPT" cloud apikey list --json > "$LIST_OUTPUT2" 2>&1
LIST_EXIT2=$?
set -e

if [ $LIST_EXIT2 -ne 0 ]; then
	echo -e "${RED}✗${NC} List API keys command failed"
	cat "$LIST_OUTPUT2"
	TEST_FAILED=true
	exit 1
fi

# Check if the new API key ID is in the list
if cat "$LIST_OUTPUT2" | jq -e ".[] | select(.id == \"$API_KEY_ID\")" > /dev/null 2>&1; then
	echo -e "${GREEN}✓${NC} New API key found in list"
else
	echo -e "${RED}✗${NC} New API key not found in list"
	cat "$LIST_OUTPUT2"
	TEST_FAILED=true
	exit 1
fi

# Verify count increased
NEW_COUNT=$(cat "$LIST_OUTPUT2" | jq 'length')
echo "New API key count: $NEW_COUNT"
if [ "$NEW_COUNT" -gt "$INITIAL_COUNT" ]; then
	echo -e "${GREEN}✓${NC} API key count increased"
else
	echo -e "${YELLOW}⚠${NC} API key count did not increase (may be filtered by project)"
fi
echo ""

# Test 4: Get the specific API key details
echo "Test 4: Get API key details..."
GET_OUTPUT="$TEMP_DIR/get.txt"
set +e
bun "$BIN_SCRIPT" cloud apikey get "$API_KEY_ID" --json > "$GET_OUTPUT" 2>&1
GET_EXIT=$?
set -e

if [ $GET_EXIT -ne 0 ]; then
	echo -e "${RED}✗${NC} Get API key command failed"
	cat "$GET_OUTPUT"
	TEST_FAILED=true
	exit 1
fi

echo -e "${GREEN}✓${NC} Get API key command succeeded"

# Verify the ID matches
GOT_ID=$(cat "$GET_OUTPUT" | jq -r '.id')
if [ "$GOT_ID" = "$API_KEY_ID" ]; then
	echo -e "${GREEN}✓${NC} API key ID matches"
else
	echo -e "${RED}✗${NC} API key ID mismatch (expected: $API_KEY_ID, got: $GOT_ID)"
	TEST_FAILED=true
	exit 1
fi

# Verify the name matches
GOT_NAME=$(cat "$GET_OUTPUT" | jq -r '.name')
if [ "$GOT_NAME" = "$API_KEY_NAME" ]; then
	echo -e "${GREEN}✓${NC} API key name matches"
else
	echo -e "${RED}✗${NC} API key name mismatch (expected: $API_KEY_NAME, got: $GOT_NAME)"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Test 5: Delete the API key
echo "Test 5: Delete API key..."
DELETE_OUTPUT="$TEMP_DIR/delete.txt"
set +e
bun "$BIN_SCRIPT" cloud apikey delete "$API_KEY_ID" --json > "$DELETE_OUTPUT" 2>&1
DELETE_EXIT=$?
set -e

if [ $DELETE_EXIT -ne 0 ]; then
	echo -e "${RED}✗${NC} Delete API key command failed"
	cat "$DELETE_OUTPUT"
	TEST_FAILED=true
	exit 1
fi

echo -e "${GREEN}✓${NC} Delete API key command succeeded"

# Verify the response indicates success
DELETE_SUCCESS=$(cat "$DELETE_OUTPUT" | jq -r '.success')
if [ "$DELETE_SUCCESS" = "true" ]; then
	echo -e "${GREEN}✓${NC} Delete response indicates success"
else
	echo -e "${RED}✗${NC} Delete response does not indicate success"
	cat "$DELETE_OUTPUT"
	TEST_FAILED=true
	exit 1
fi
echo ""

# Test 6: Verify the API key no longer appears in the list
echo "Test 6: Verify API key no longer in list..."
LIST_OUTPUT3="$TEMP_DIR/list3.txt"
set +e
bun "$BIN_SCRIPT" cloud apikey list --json > "$LIST_OUTPUT3" 2>&1
LIST_EXIT3=$?
set -e

if [ $LIST_EXIT3 -ne 0 ]; then
	echo -e "${RED}✗${NC} List API keys command failed"
	cat "$LIST_OUTPUT3"
	TEST_FAILED=true
	exit 1
fi

# Check if the deleted API key ID is NOT in the list
if cat "$LIST_OUTPUT3" | jq -e ".[] | select(.id == \"$API_KEY_ID\")" > /dev/null 2>&1; then
	echo -e "${RED}✗${NC} Deleted API key still appears in list"
	TEST_FAILED=true
	exit 1
else
	echo -e "${GREEN}✓${NC} Deleted API key no longer in list"
fi
echo ""

# Test 7: Verify get on deleted key fails appropriately
echo "Test 7: Verify get on deleted key fails..."
GET_DELETED_OUTPUT="$TEMP_DIR/get-deleted.txt"
set +e
bun "$BIN_SCRIPT" cloud apikey get "$API_KEY_ID" --json > "$GET_DELETED_OUTPUT" 2>&1
GET_DELETED_EXIT=$?
set -e

if [ $GET_DELETED_EXIT -ne 0 ]; then
	echo -e "${GREEN}✓${NC} Get deleted API key correctly fails"
else
	echo -e "${YELLOW}⚠${NC} Get deleted API key did not fail (soft delete may still return data)"
fi
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "API Key CLI operations working correctly."
echo "  - List API keys"
echo "  - Create API key"
echo "  - Get API key details"
echo "  - Delete API key"
echo "  - Verify deletion"
echo "========================================="
echo ""

print_result
