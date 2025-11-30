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

# Wait a few seconds for bucket to be fully provisioned
echo "Waiting for bucket to be fully ready..."
sleep 3
echo ""

# Step 5: Upload a test file
echo "Step 5: Uploading test file..."
TEST_FILE="/tmp/test-storage-$$.txt"
echo "Hello from storage test!" > "$TEST_FILE"

UPLOAD_OUTPUT=$($BIN_SCRIPT cloud storage upload "$BUCKET_NAME" "$TEST_FILE" 2>&1)
echo "$UPLOAD_OUTPUT"

if echo "$UPLOAD_OUTPUT" | grep -q "Uploaded"; then
	echo -e "${GREEN}✓ PASS:${NC} File uploaded successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to upload file"
	rm -f "$TEST_FILE"
	exit 1
fi
echo ""

# Step 5b: Upload via STDIN (test put alias)
echo "Step 5b: Uploading via STDIN (testing 'put' alias)..."
STDIN_UPLOAD_OUTPUT=$(echo "Piped content from test" | $BIN_SCRIPT cloud storage put "$BUCKET_NAME" - --content-type text/plain 2>&1)
echo "$STDIN_UPLOAD_OUTPUT"

if echo "$STDIN_UPLOAD_OUTPUT" | grep -q "Uploaded stdin"; then
	echo -e "${GREEN}✓ PASS:${NC} STDIN upload successful"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to upload from STDIN"
	rm -f "$TEST_FILE"
	exit 1
fi
echo ""

# Step 6: List files in bucket
echo "Step 6: Listing files in bucket..."
LIST_FILES_OUTPUT=$($BIN_SCRIPT cloud storage list "$BUCKET_NAME" 2>&1)
echo "$LIST_FILES_OUTPUT"

TEST_FILENAME=$(basename "$TEST_FILE")
if echo "$LIST_FILES_OUTPUT" | grep -q "$TEST_FILENAME"; then
	echo -e "${GREEN}✓ PASS:${NC} Uploaded file found in list"
else
	echo -e "${RED}✗ FAIL:${NC} Uploaded file not found in list"
	rm -f "$TEST_FILE"
	exit 1
fi

if echo "$LIST_FILES_OUTPUT" | grep -q "stdin"; then
	echo -e "${GREEN}✓ PASS:${NC} STDIN upload found in list"
else
	echo -e "${RED}✗ FAIL:${NC} STDIN upload not found in list"
	rm -f "$TEST_FILE"
	exit 1
fi
echo ""

# Step 6b: Test JSON list output
echo "Step 6b: Testing JSON list files output..."
LIST_FILES_JSON=$($BIN_SCRIPT --json cloud storage list "$BUCKET_NAME" 2>&1)
echo "$LIST_FILES_JSON" | jq .

FILE_COUNT=$(echo "$LIST_FILES_JSON" | jq '.files | length')
if [ "$FILE_COUNT" -ge 2 ]; then
	echo -e "${GREEN}✓ PASS:${NC} JSON list output valid (found $FILE_COUNT files)"
else
	echo -e "${RED}✗ FAIL:${NC} JSON list output invalid"
	rm -f "$TEST_FILE"
	exit 1
fi
echo ""

# Step 7: Download file
echo "Step 7: Downloading file..."
DOWNLOAD_FILE="/tmp/test-storage-download-$$.txt"
DOWNLOAD_OUTPUT=$($BIN_SCRIPT cloud storage download "$BUCKET_NAME" "$TEST_FILENAME" "$DOWNLOAD_FILE" 2>&1)
echo "$DOWNLOAD_OUTPUT"

if [ -f "$DOWNLOAD_FILE" ]; then
	DOWNLOAD_CONTENT=$(cat "$DOWNLOAD_FILE")
	if [ "$DOWNLOAD_CONTENT" = "Hello from storage test!" ]; then
		echo -e "${GREEN}✓ PASS:${NC} File downloaded successfully with correct content"
	else
		echo -e "${RED}✗ FAIL:${NC} Downloaded file has incorrect content"
		echo "Expected: 'Hello from storage test!'"
		echo "Got: '$DOWNLOAD_CONTENT'"
		rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
		exit 1
	fi
else
	echo -e "${RED}✗ FAIL:${NC} Failed to download file"
	rm -f "$TEST_FILE"
	exit 1
fi
echo ""

# Step 7b: Download to STDOUT
echo "Step 7b: Testing download to STDOUT..."
STDOUT_CONTENT=$($BIN_SCRIPT cloud storage download "$BUCKET_NAME" "$TEST_FILENAME" - 2>&1)

if [ "$STDOUT_CONTENT" = "Hello from storage test!" ]; then
	echo -e "${GREEN}✓ PASS:${NC} STDOUT download successful"
else
	echo -e "${RED}✗ FAIL:${NC} STDOUT download failed or incorrect content"
	echo "Expected: 'Hello from storage test!'"
	echo "Got: '$STDOUT_CONTENT'"
	rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
	exit 1
fi
echo ""

# Step 7c: Test download metadata
echo "Step 7c: Testing metadata download..."
METADATA_OUTPUT=$($BIN_SCRIPT cloud storage download "$BUCKET_NAME" "$TEST_FILENAME" --metadata 2>&1)
echo "$METADATA_OUTPUT"

if echo "$METADATA_OUTPUT" | grep -q "Size:" && echo "$METADATA_OUTPUT" | grep -q "Content Type:"; then
	echo -e "${GREEN}✓ PASS:${NC} Metadata retrieved successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to retrieve metadata"
	rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
	exit 1
fi
echo ""

# Step 7d: Test JSON metadata
echo "Step 7d: Testing JSON metadata output..."
METADATA_JSON=$($BIN_SCRIPT --json cloud storage download "$BUCKET_NAME" "$TEST_FILENAME" --metadata 2>&1)
echo "$METADATA_JSON" | jq .

FILE_SIZE=$(echo "$METADATA_JSON" | jq -r '.size')
# Use wc -c to get byte size of the local file in a portable way
EXPECTED_SIZE=$(wc -c < "$TEST_FILE" | tr -d ' ')
if [ "$FILE_SIZE" -eq "$EXPECTED_SIZE" ]; then
	echo -e "${GREEN}✓ PASS:${NC} JSON metadata valid"
else
	echo -e "${RED}✗ FAIL:${NC} JSON metadata invalid (expected size $EXPECTED_SIZE, got $FILE_SIZE)"
	rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
	exit 1
fi
echo ""

# Step 8: Delete a file from bucket
echo "Step 8: Deleting file from bucket (testing 'remove' alias)..."
DELETE_FILE_OUTPUT=$($BIN_SCRIPT cloud storage remove "$BUCKET_NAME" "$TEST_FILENAME" --confirm 2>&1)
echo "$DELETE_FILE_OUTPUT"

if echo "$DELETE_FILE_OUTPUT" | grep -q "Deleted file"; then
	echo -e "${GREEN}✓ PASS:${NC} File deleted successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to delete file"
	rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
	exit 1
fi
echo ""

# Step 8b: Verify file deletion
echo "Step 8b: Verifying file deletion..."
LIST_AFTER_FILE_DELETE=$($BIN_SCRIPT cloud storage list "$BUCKET_NAME" 2>&1)
echo "$LIST_AFTER_FILE_DELETE"

if echo "$LIST_AFTER_FILE_DELETE" | grep -q "$TEST_FILENAME"; then
	echo -e "${RED}✗ FAIL:${NC} File still exists after deletion"
	rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
	exit 1
else
	echo -e "${GREEN}✓ PASS:${NC} File successfully removed"
fi
echo ""

# Clean up STDIN upload
echo "Step 8c: Cleaning up STDIN upload..."
$BIN_SCRIPT cloud storage delete "$BUCKET_NAME" stdin --confirm &> /dev/null || true
echo -e "${GREEN}✓ PASS:${NC} Cleanup complete"
echo ""

# Step 9: Delete the storage bucket
echo "Step 9: Deleting storage bucket..."
DELETE_OUTPUT=$($BIN_SCRIPT cloud storage delete "$BUCKET_NAME" --confirm 2>&1)
echo "$DELETE_OUTPUT"

if echo "$DELETE_OUTPUT" | grep -q "Deleted storage bucket"; then
	echo -e "${GREEN}✓ PASS:${NC} Storage bucket deleted"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to delete storage bucket"
	rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
	exit 1
fi
echo ""

# Step 10: Verify deletion
echo "Step 10: Verifying storage bucket deletion..."
LIST_AFTER_DELETE=$($BIN_SCRIPT cloud storage list 2>&1)
echo "$LIST_AFTER_DELETE"

if echo "$LIST_AFTER_DELETE" | grep -q "$BUCKET_NAME"; then
	echo -e "${RED}✗ FAIL:${NC} Storage bucket still exists after deletion"
	rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
	exit 1
else
	echo -e "${GREEN}✓ PASS:${NC} Storage bucket successfully removed"
fi

# Cleanup temp files
rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Storage resource CLI commands working correctly."
echo ""
echo "Bucket Management:"
echo "  ✓ create - Create storage bucket"
echo "  ✓ list - List storage buckets"
echo "  ✓ get - Get storage bucket details"
echo "  ✓ delete - Delete storage bucket"
echo ""
echo "File Operations:"
echo "  ✓ upload/put - Upload files (file & STDIN)"
echo "  ✓ list <bucket> - List files in bucket"
echo "  ✓ download - Download files (file & STDOUT)"
echo "  ✓ download --metadata - Get file metadata"
echo "  ✓ remove/delete - Delete files from bucket"
echo ""
echo "Output Formats:"
echo "  ✓ Human-readable output"
echo "  ✓ JSON output (--json)"
echo "========================================="
echo ""
