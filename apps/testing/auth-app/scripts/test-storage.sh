#!/bin/bash

# Storage Resource Test Script
# Tests CLI commands for storage resource management

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Storage Resource Test"
echo "========================================="
echo ""

BIN_SCRIPT="$(cd "$(dirname "$0")" && pwd)/../../../../packages/cli/bin/cli.ts"

# Check if user is authenticated
set +e
$BIN_SCRIPT auth whoami &> /dev/null
AUTH_CHECK=$?
set -e

if [ $AUTH_CHECK -ne 0 ]; then
	echo -e "${RED}✗ SKIP:${NC} Not authenticated. Run 'agentuity auth login' first."
	exit 0
fi

echo "Step 1: Creating a test storage bucket..."
set +e
CREATE_OUTPUT=$($BIN_SCRIPT cloud storage create 2>&1)
CREATE_EXIT=$?
set -e

echo "$CREATE_OUTPUT"

if [ $CREATE_EXIT -ne 0 ]; then
	echo ""
	echo -e "${RED}✗ FAIL:${NC} Storage creation command failed with exit code: $CREATE_EXIT"
	echo -e "${YELLOW}Command output:${NC}"
	echo "$CREATE_OUTPUT"
	echo ""
	echo -e "${YELLOW}Attempting JSON output for more details...${NC}"
	set +e
	CREATE_JSON=$($BIN_SCRIPT --json cloud storage create 2>&1)
	JSON_EXIT=$?
	set -e
	echo "$CREATE_JSON"
	if [ $JSON_EXIT -ne 0 ]; then
		echo -e "${RED}JSON command also failed with exit code: $JSON_EXIT${NC}"
	fi
	exit 1
fi

# Extract bucket name from output
BUCKET_NAME=$(echo "$CREATE_OUTPUT" | grep -oE "Created storage: [a-zA-Z0-9_-]+" | sed 's/Created storage: //' || true)

if [ -z "$BUCKET_NAME" ]; then
	# Try JSON output if human-readable failed
	echo -e "${YELLOW}Could not extract bucket name from output, trying JSON...${NC}"
	set +e
	CREATE_JSON=$($BIN_SCRIPT --json cloud storage create 2>&1)
	JSON_EXIT=$?
	set -e
	if [ $JSON_EXIT -ne 0 ]; then
		echo -e "${RED}✗ FAIL:${NC} JSON command failed with exit code: $JSON_EXIT"
		echo "$CREATE_JSON"
		exit 1
	fi
	BUCKET_NAME=$(echo "$CREATE_JSON" | jq -r '.name' 2>/dev/null || echo "")
fi

if [ -z "$BUCKET_NAME" ]; then
	echo -e "${RED}✗ FAIL:${NC} Failed to create storage bucket or extract bucket name"
	echo -e "${YELLOW}Command output:${NC}"
	echo "$CREATE_OUTPUT"
	exit 1
fi

echo -e "${GREEN}✓ PASS:${NC} Created storage bucket: $BUCKET_NAME"
echo ""

# Step 2: List storage buckets
echo "Step 2: Listing storage buckets..."
LIST_OUTPUT=$($BIN_SCRIPT cloud storage list 2>&1)
echo "$LIST_OUTPUT"

if echo "$LIST_OUTPUT" | grep -q "$BUCKET_NAME"; then
	echo -e "${GREEN}✓ PASS:${NC} Storage bucket found in list"
else
	echo -e "${RED}✗ FAIL:${NC} Storage bucket not found in list"
	exit 1
fi
echo ""

# Step 3: Get storage bucket details
echo "Step 3: Getting storage bucket details..."
GET_OUTPUT=$($BIN_SCRIPT cloud storage get "$BUCKET_NAME" 2>&1)
echo "$GET_OUTPUT"

if echo "$GET_OUTPUT" | grep -q "$BUCKET_NAME"; then
	echo -e "${GREEN}✓ PASS:${NC} Storage bucket details retrieved"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to get storage bucket details"
	exit 1
fi
echo ""

# Step 4: Test JSON output
echo "Step 4: Testing JSON output..."
JSON_OUTPUT=$($BIN_SCRIPT --json cloud storage get "$BUCKET_NAME" 2>&1)
echo "$JSON_OUTPUT" | jq .

BUCKET_NAME_JSON=$(echo "$JSON_OUTPUT" | jq -r '.bucket_name')
if [ "$BUCKET_NAME_JSON" = "$BUCKET_NAME" ]; then
	echo -e "${GREEN}✓ PASS:${NC} JSON output valid"
else
	echo -e "${RED}✗ FAIL:${NC} JSON output invalid"
	exit 1
fi
echo ""

# Step 5: Delete the storage bucket
echo "Step 5: Deleting storage bucket..."
DELETE_OUTPUT=$($BIN_SCRIPT cloud storage delete "$BUCKET_NAME" --confirm 2>&1)
echo "$DELETE_OUTPUT"

if echo "$DELETE_OUTPUT" | grep -q "Deleted storage bucket"; then
	echo -e "${GREEN}✓ PASS:${NC} Storage bucket deleted"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to delete storage bucket"
	exit 1
fi
echo ""

# Step 6: Verify deletion
echo "Step 6: Verifying storage bucket deletion..."
LIST_AFTER_DELETE=$($BIN_SCRIPT cloud storage list 2>&1)
echo "$LIST_AFTER_DELETE"

if echo "$LIST_AFTER_DELETE" | grep -q "$BUCKET_NAME"; then
	echo -e "${RED}✗ FAIL:${NC} Storage bucket still exists after deletion"
	exit 1
else
	echo -e "${GREEN}✓ PASS:${NC} Storage bucket successfully removed"
fi
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Storage resource CLI commands working correctly."
echo "  ✓ create - Create storage bucket"
echo "  ✓ list - List storage buckets"
echo "  ✓ get - Get storage bucket details"
echo "  ✓ delete - Delete storage bucket"
echo "  ✓ JSON output support"
echo "========================================="
echo ""
