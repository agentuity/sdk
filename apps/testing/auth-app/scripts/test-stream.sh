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

BASE_URL="http://localhost:3000/agent/stream"
PORT=3000

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
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "✓ text/plain content type verified"
echo "✓ application/json content type verified"
echo "✓ image/png binary content verified (base64)"
echo "✓ application/octet-stream ArrayBuffer verified"
echo "✓ SHA256 integrity checks passed"
echo "Stream storage working correctly."
echo "========================================="
echo ""

print_result
