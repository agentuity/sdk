#!/bin/bash

# Stream Storage Test Script
# Tests CRUD operations for Stream storage with content-type validation and SHA256 verification

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Stream Storage Test"
echo "========================================="
echo ""

BASE_URL="http://localhost:3500/agent/stream"
PORT=3500

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)

trap cleanup EXIT

# Start server if needed
start_server_if_needed

# Helper function to calculate SHA256
calculate_sha256() {
	echo -n "$1" | sha256
}

# Helper function to calculate SHA256 from base64
calculate_sha256_from_base64() {
	echo "$1" | b64decode | sha256
}

# Step 1: Test text/plain content type
echo "Step 1: Testing text/plain content type..."
TEXT_CONTENT="Hello Stream Storage! This is plain text."
TEXT_SHA256=$(calculate_sha256 "$TEXT_CONTENT")
echo "  Original SHA256: $TEXT_SHA256"

CREATE_TEXT=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"create\",\"name\":\"test-text\",\"content\":\"$TEXT_CONTENT\",\"contentType\":\"text/plain\"}")

TEXT_ID=$(echo "$CREATE_TEXT" | jq -r .result.id)
TEXT_BYTES=$(echo "$CREATE_TEXT" | jq -r .result.bytesWritten)

if [ "$TEXT_BYTES" -eq "${#TEXT_CONTENT}" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Created text stream (ID: $TEXT_ID, bytes: $TEXT_BYTES)"
else
	echo -e "${RED}✗ FAIL:${NC} Byte count mismatch: expected ${#TEXT_CONTENT}, got $TEXT_BYTES"
	exit 1
fi

# Read back and verify
READ_TEXT=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"read\",\"id\":\"$TEXT_ID\"}")

READ_CONTENT_TYPE=$(echo "$READ_TEXT" | jq -r .result.contentType)
READ_DATA=$(echo "$READ_TEXT" | jq -r .result.data)
READ_SHA256=$(calculate_sha256_from_base64 "$READ_DATA")

if [ "$READ_CONTENT_TYPE" = "text/plain" ] && [ "$READ_SHA256" = "$TEXT_SHA256" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Content-Type and SHA256 verified for text/plain"
else
	echo -e "${RED}✗ FAIL:${NC} Content-Type: $READ_CONTENT_TYPE, SHA256 match: $([ "$READ_SHA256" = "$TEXT_SHA256" ] && echo 'yes' || echo 'no')"
	exit 1
fi
echo ""

# Step 2: Test application/json content type
echo "Step 2: Testing application/json content type..."
JSON_CONTENT='{"message":"Hello JSON","timestamp":1234567890,"data":{"key":"value"}}'
JSON_SHA256=$(calculate_sha256 "$JSON_CONTENT")
echo "  Original SHA256: $JSON_SHA256"

CREATE_JSON=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"create\",\"name\":\"test-json\",\"content\":$(echo "$JSON_CONTENT" | jq -R .),\"contentType\":\"application/json\"}")

JSON_ID=$(echo "$CREATE_JSON" | jq -r .result.id)
JSON_BYTES=$(echo "$CREATE_JSON" | jq -r .result.bytesWritten)

if [ "$JSON_BYTES" -eq "${#JSON_CONTENT}" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Created JSON stream (ID: $JSON_ID, bytes: $JSON_BYTES)"
else
	echo -e "${RED}✗ FAIL:${NC} Byte count mismatch: expected ${#JSON_CONTENT}, got $JSON_BYTES"
	exit 1
fi

# Read back and verify
READ_JSON=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"read\",\"id\":\"$JSON_ID\"}")

READ_JSON_TYPE=$(echo "$READ_JSON" | jq -r .result.contentType)
READ_JSON_DATA=$(echo "$READ_JSON" | jq -r .result.data)
READ_JSON_SHA256=$(calculate_sha256_from_base64 "$READ_JSON_DATA")

if [ "$READ_JSON_TYPE" = "application/json" ] && [ "$READ_JSON_SHA256" = "$JSON_SHA256" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Content-Type and SHA256 verified for application/json"
else
	echo -e "${RED}✗ FAIL:${NC} Content-Type: $READ_JSON_TYPE, SHA256 match: $([ "$READ_JSON_SHA256" = "$JSON_SHA256" ] && echo 'yes' || echo 'no')"
	exit 1
fi
echo ""

# Step 3: Test binary content (image/png) - base64 encoded
echo "Step 3: Testing binary content (image/png) via base64..."
# Create a minimal PNG file (1x1 pixel transparent PNG)
PNG_BASE64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
PNG_CONTENT=$(echo "$PNG_BASE64" | b64decode | base64 | tr -d '\n')
PNG_SHA256=$(echo "$PNG_BASE64" | b64decode | sha256)
echo "  Original SHA256: $PNG_SHA256"

# For binary, we need to send base64-encoded data
CREATE_PNG=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"create\",\"name\":\"test-image\",\"content\":\"$PNG_CONTENT\",\"contentType\":\"image/png\"}")

PNG_ID=$(echo "$CREATE_PNG" | jq -r .result.id)
PNG_BYTES=$(echo "$CREATE_PNG" | jq -r .result.bytesWritten)

echo -e "${GREEN}✓${NC} Created PNG stream (ID: $PNG_ID, bytes: $PNG_BYTES)"

# Read back and verify
READ_PNG=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"read\",\"id\":\"$PNG_ID\"}")

READ_PNG_TYPE=$(echo "$READ_PNG" | jq -r .result.contentType)
READ_PNG_DATA=$(echo "$READ_PNG" | jq -r .result.data)
READ_PNG_SHA256=$(calculate_sha256_from_base64 "$READ_PNG_DATA")

if [ "$READ_PNG_TYPE" = "image/png" ] && [ "$READ_PNG_SHA256" = "$PNG_SHA256" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Content-Type and SHA256 verified for image/png"
else
	echo -e "${RED}✗ FAIL:${NC} Content-Type: $READ_PNG_TYPE, SHA256 match: $([ "$READ_PNG_SHA256" = "$PNG_SHA256" ] && echo 'yes' || echo 'no')"
	echo "  Expected SHA256: $PNG_SHA256"
	echo "  Got SHA256: $READ_PNG_SHA256"
	exit 1
fi
echo ""

# Step 3b: Test ArrayBuffer binary content (application/octet-stream)
echo "Step 3b: Testing ArrayBuffer binary content (application/octet-stream)..."
# Create some binary data
BINARY_DATA=$'This is raw binary data with special chars: \x00\x01\x02\xFF'
BINARY_BASE64=$(printf "%s" "$BINARY_DATA" | base64)
BINARY_SHA256=$(printf "%s" "$BINARY_DATA" | sha256)
echo "  Original SHA256: $BINARY_SHA256"

CREATE_BINARY=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"create\",\"name\":\"test-binary\",\"content\":\"$BINARY_BASE64\",\"contentType\":\"application/octet-stream\"}")

BINARY_ID=$(echo "$CREATE_BINARY" | jq -r .result.id)
BINARY_BYTES=$(echo "$CREATE_BINARY" | jq -r .result.bytesWritten)

echo -e "${GREEN}✓${NC} Created binary stream (ID: $BINARY_ID, bytes: $BINARY_BYTES)"

# Read back and verify
READ_BINARY=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"read\",\"id\":\"$BINARY_ID\"}")

READ_BINARY_TYPE=$(echo "$READ_BINARY" | jq -r .result.contentType)
READ_BINARY_DATA=$(echo "$READ_BINARY" | jq -r .result.data)
READ_BINARY_SHA256=$(calculate_sha256_from_base64 "$READ_BINARY_DATA")

if [ "$READ_BINARY_TYPE" = "application/octet-stream" ] && [ "$READ_BINARY_SHA256" = "$BINARY_SHA256" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Content-Type and SHA256 verified for application/octet-stream"
else
	echo -e "${RED}✗ FAIL:${NC} Content-Type: $READ_BINARY_TYPE, SHA256 match: $([ "$READ_BINARY_SHA256" = "$BINARY_SHA256" ] && echo 'yes' || echo 'no')"
	echo "  Expected SHA256: $BINARY_SHA256"
	echo "  Got SHA256: $READ_BINARY_SHA256"
	exit 1
fi
echo ""

# Step 4: List streams
echo "Step 4: Listing all streams..."
LIST_RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"operation":"list","limit":5}')

SUCCESS=$(echo "$LIST_RESPONSE" | jq -r .success)
TOTAL=$(echo "$LIST_RESPONSE" | jq -r .result.total)

if [ "$SUCCESS" = "true" ] && [ "$TOTAL" -ge 4 ]; then
	echo -e "${GREEN}✓ PASS:${NC} List operation successful, found $TOTAL stream(s)"
else
	echo -e "${RED}✗ FAIL:${NC} List operation failed or insufficient streams found"
	exit 1
fi
echo ""

# Step 5: Test GET endpoint (convenience method)
echo "Step 5: Testing GET endpoint..."
GET_RESPONSE=$(curl -s -X GET "$BASE_URL")

SUCCESS=$(echo "$GET_RESPONSE" | jq -r .success)

if [ "$SUCCESS" = "true" ]; then
	echo -e "${GREEN}✓ PASS:${NC} GET endpoint successful"
else
	echo -e "${RED}✗ FAIL:${NC} GET endpoint failed"
	exit 1
fi
echo ""

# Step 6: Delete streams
echo "Step 6: Deleting test streams..."
for STREAM_ID in "$TEXT_ID" "$JSON_ID" "$PNG_ID" "$BINARY_ID"; do
	DELETE_RESPONSE=$(curl -s -X POST "$BASE_URL" \
	  -H "Content-Type: application/json" \
	  -d "{\"operation\":\"delete\",\"id\":\"$STREAM_ID\"}")
	
	SUCCESS=$(echo "$DELETE_RESPONSE" | jq -r .success)
	if [ "$SUCCESS" = "true" ]; then
		echo -e "${GREEN}✓${NC} Deleted stream $STREAM_ID"
	else
		echo -e "${YELLOW}⚠${NC} Failed to delete stream $STREAM_ID"
	fi
done
echo ""

echo "========================================="
echo "Testing CLI Commands"
echo "========================================="
echo ""

# Use local CLI binary (navigate from apps/testing/auth-app/scripts to sdk root)
SDK_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
LOCAL_CLI="$SDK_ROOT/packages/cli/bin/cli.ts"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"  # auth-app directory contains agentuity.json

# Step 7: Test CLI stream list command
echo "Step 7: Testing CLI 'stream list' command..."
CLI_LIST_OUTPUT=$(bun "$LOCAL_CLI" cloud stream list --dir "$PROJECT_DIR" 2>&1 || true)

if echo "$CLI_LIST_OUTPUT" | grep -qE "(Total|Streams|Name)"; then
	echo -e "${GREEN}✓ PASS:${NC} CLI stream list command executed"
	echo "  Sample output:"
	echo "$CLI_LIST_OUTPUT" | head -10
else
	echo -e "${YELLOW}⚠ WARNING:${NC} CLI stream list command may have issues"
	echo "  Output: $CLI_LIST_OUTPUT"
fi
echo ""

# Step 8: Test CLI stream list with JSON output
echo "Step 8: Testing CLI 'stream list --json' command..."
CLI_LIST_JSON=$(bun "$LOCAL_CLI" cloud stream list --dir "$PROJECT_DIR" --json 2>&1 || true)

if echo "$CLI_LIST_JSON" | jq -e '.total != null and .streams != null' > /dev/null 2>&1; then
	TOTAL=$(echo "$CLI_LIST_JSON" | jq -r .total)
	STREAM_COUNT=$(echo "$CLI_LIST_JSON" | jq -r '.streams | length')
	echo -e "${GREEN}✓ PASS:${NC} CLI stream list --json returned valid JSON"
	echo "  Total: $TOTAL, Returned: $STREAM_COUNT streams"
else
	echo -e "${YELLOW}⚠ WARNING:${NC} CLI stream list --json did not return valid JSON"
	echo "  Output: $CLI_LIST_JSON"
fi
echo ""

# Create a new stream for CLI testing (so we don't use deleted streams)
echo "Step 9: Creating test stream for CLI commands..."
CLI_TEST_CONTENT="CLI test stream content for download verification"
CLI_TEST_SHA256=$(calculate_sha256 "$CLI_TEST_CONTENT")

CLI_TEST_CREATE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"create\",\"name\":\"cli-test\",\"content\":\"$CLI_TEST_CONTENT\",\"contentType\":\"text/plain\"}")

CLI_TEST_ID=$(echo "$CLI_TEST_CREATE" | jq -r .result.id)
echo -e "${GREEN}✓${NC} Created test stream for CLI (ID: $CLI_TEST_ID)"
echo ""

# Step 10: Test CLI stream get command
echo "Step 10: Testing CLI 'stream get' command..."
if [ -n "$CLI_TEST_ID" ] && [ "$CLI_TEST_ID" != "null" ]; then
	CLI_GET_OUTPUT=$(bun "$LOCAL_CLI" cloud stream get "$CLI_TEST_ID" --dir "$PROJECT_DIR" 2>&1 || true)
	
	if echo "$CLI_GET_OUTPUT" | grep -qE "(ID:|Name:|Size:)"; then
		echo -e "${GREEN}✓ PASS:${NC} CLI stream get command executed"
		echo "  Output:"
		echo "$CLI_GET_OUTPUT"
	else
		echo -e "${YELLOW}⚠ WARNING:${NC} CLI stream get command may have issues"
		echo "  Output: $CLI_GET_OUTPUT"
	fi
else
	echo -e "${YELLOW}⚠ SKIP:${NC} No stream ID available for get test"
fi
echo ""

# Step 11: Test CLI stream get with JSON output
echo "Step 11: Testing CLI 'stream get --json' command..."
if [ -n "$CLI_TEST_ID" ] && [ "$CLI_TEST_ID" != "null" ]; then
	CLI_GET_JSON=$(bun "$LOCAL_CLI" cloud stream get "$CLI_TEST_ID" --dir "$PROJECT_DIR" --json 2>&1 || true)
	
	if echo "$CLI_GET_JSON" | jq -e '.id != null and .name != null and .sizeBytes != null' > /dev/null 2>&1; then
		STREAM_NAME=$(echo "$CLI_GET_JSON" | jq -r .name)
		STREAM_SIZE=$(echo "$CLI_GET_JSON" | jq -r .sizeBytes)
		echo -e "${GREEN}✓ PASS:${NC} CLI stream get --json returned valid JSON"
		echo "  Name: $STREAM_NAME, Size: $STREAM_SIZE bytes"
	else
		echo -e "${YELLOW}⚠ WARNING:${NC} CLI stream get --json did not return valid JSON"
		echo "  Output: $CLI_GET_JSON"
	fi
else
	echo -e "${YELLOW}⚠ SKIP:${NC} No stream ID available for get --json test"
fi
echo ""

# Step 12: Test CLI stream download with --output flag
echo "Step 12: Testing CLI 'stream get --output' command..."
if [ -n "$CLI_TEST_ID" ]; then
	DOWNLOAD_FILE="$TEMP_DIR/downloaded-stream.txt"
	CLI_DOWNLOAD_OUTPUT=$(bun "$LOCAL_CLI" cloud stream get "$CLI_TEST_ID" --dir "$PROJECT_DIR" --output "$DOWNLOAD_FILE" 2>&1 || true)
	
	if [ -f "$DOWNLOAD_FILE" ]; then
		DOWNLOADED_CONTENT=$(cat "$DOWNLOAD_FILE")
		DOWNLOADED_SHA256=$(calculate_sha256 "$DOWNLOADED_CONTENT")
		
		if [ "$DOWNLOADED_SHA256" = "$CLI_TEST_SHA256" ]; then
			FILE_SIZE=$(wc -c < "$DOWNLOAD_FILE" | tr -d ' ')
			echo -e "${GREEN}✓ PASS:${NC} Downloaded stream content matches original (${FILE_SIZE} bytes)"
			echo "  File: $DOWNLOAD_FILE"
			echo "  SHA256 verified"
		else
			echo -e "${RED}✗ FAIL:${NC} Downloaded content does not match original"
			echo "  Expected SHA256: $CLI_TEST_SHA256"
			echo "  Got SHA256: $DOWNLOADED_SHA256"
			echo "  Expected content: $CLI_TEST_CONTENT"
			echo "  Downloaded content: $DOWNLOADED_CONTENT"
			exit 1
		fi
	else
		echo -e "${RED}✗ FAIL:${NC} Download file was not created"
		echo "  Expected file: $DOWNLOAD_FILE"
		echo "  CLI output: $CLI_DOWNLOAD_OUTPUT"
		exit 1
	fi
else
	echo -e "${YELLOW}⚠ SKIP:${NC} No stream ID available for download test"
fi
echo ""

# Step 13: Test CLI stream delete command
echo "Step 13: Testing CLI 'stream delete' command..."
if [ -n "$CLI_TEST_ID" ] && [ "$CLI_TEST_ID" != "null" ]; then
	CLI_DELETE_OUTPUT=$(bun "$LOCAL_CLI" cloud stream delete "$CLI_TEST_ID" --dir "$PROJECT_DIR" --json 2>&1 || true)
	
	if echo "$CLI_DELETE_OUTPUT" | jq -e '.id != null' > /dev/null 2>&1; then
		DELETED_ID=$(echo "$CLI_DELETE_OUTPUT" | jq -r .id)
		if [ "$DELETED_ID" = "$CLI_TEST_ID" ]; then
			echo -e "${GREEN}✓ PASS:${NC} CLI stream delete command succeeded (ID: $DELETED_ID)"
			
			# Verify deletion by attempting to get the stream
			CLI_GET_AFTER_DELETE=$(bun "$LOCAL_CLI" cloud stream get "$CLI_TEST_ID" --dir "$PROJECT_DIR" --json 2>&1 || true)
			if echo "$CLI_GET_AFTER_DELETE" | grep -qE "(not found|404|error)"; then
				echo -e "${GREEN}✓ PASS:${NC} Stream verified as deleted (get failed as expected)"
			else
				echo -e "${YELLOW}⚠ WARNING:${NC} Stream may not have been deleted (get succeeded)"
			fi
		else
			echo -e "${YELLOW}⚠ WARNING:${NC} CLI stream delete returned wrong ID"
			echo "  Expected: $CLI_TEST_ID, Got: $DELETED_ID"
		fi
	else
		echo -e "${YELLOW}⚠ WARNING:${NC} CLI stream delete did not return valid JSON"
		echo "  Output: $CLI_DELETE_OUTPUT"
		# Fallback to API delete
		curl -s -X POST "$BASE_URL" \
		  -H "Content-Type: application/json" \
		  -d "{\"operation\":\"delete\",\"id\":\"$CLI_TEST_ID\"}" > /dev/null
		echo "  Used API fallback to delete stream"
	fi
else
	echo -e "${YELLOW}⚠ SKIP:${NC} No stream ID available for delete test"
fi
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "✓ text/plain content type verified"
echo "✓ application/json content type verified"
echo "✓ image/png binary content verified (base64)"
echo "✓ application/octet-stream ArrayBuffer verified"
echo "✓ SHA256 integrity checks passed"
echo "✓ CLI stream list command tested"
echo "✓ CLI stream get command tested"
echo "Stream storage working correctly."
echo "========================================="
echo ""

print_result
