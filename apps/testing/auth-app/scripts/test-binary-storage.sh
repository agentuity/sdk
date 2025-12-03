#!/bin/bash

# Binary Object Storage Test Script
# Tests that binary data can be uploaded and downloaded without corruption

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Binary Object Storage Test"
echo "========================================="
echo ""

# Generate unique key prefix for this test run to avoid collisions in concurrent tests
TEST_RUN_ID="test-$(date +%s%N)"
echo "Test Run ID: $TEST_RUN_ID"
echo ""

BASE_URL="http://localhost:$PORT/api/objectstore"
BUCKET="ago-dbce74-test-bucket-v1" # usc region
PORT="${PORT:-3500}"

# Generate unique keys to avoid collisions when tests run in parallel
UNIQUE_ID="$(date +%s)-$$-$RANDOM"
RANDOM_KEY="test-$UNIQUE_ID-random.bin"
PROBLEMATIC_KEY="test-$UNIQUE_ID-problematic.bin"

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)

trap cleanup EXIT

# Start server if needed
start_server_if_needed

echo ""

echo "Test directory: $TEMP_DIR"
echo ""

# Step 1: Create a test file with random binary data
echo "Step 1: Creating test file with random binary data (1KB)..."
dd if=/dev/urandom of="$TEMP_DIR/original.bin" bs=1024 count=1 2>/dev/null
ORIGINAL_MD5=$(md5sum "$TEMP_DIR/original.bin" | cut -d' ' -f1)
echo -e "${GREEN}✓${NC} Created original.bin (MD5: $ORIGINAL_MD5)"
echo ""

# Step 2: Create a file with problematic bytes (null bytes, high bytes)
echo "Step 2: Creating file with problematic bytes..."
printf '\x00\x01\x02\xFF\xFE\xFD\x80\x7F\x00\xFF' > "$TEMP_DIR/problematic.bin"
PROBLEMATIC_MD5=$(md5sum "$TEMP_DIR/problematic.bin" | cut -d' ' -f1)
echo -e "${GREEN}✓${NC} Created problematic.bin (MD5: $PROBLEMATIC_MD5)"
echo ""

# Step 3: Upload random binary file
echo "Step 3: Uploading random binary data..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-random.bin" \
  --data-binary "@$TEMP_DIR/original.bin" \
  -H "Content-Type: application/octet-stream")

# Check if response is JSON before piping to jq
if echo "$UPLOAD_RESPONSE" | jq . > /dev/null 2>&1; then
	echo "$UPLOAD_RESPONSE" | jq .
else
	echo "Error: Non-JSON response:"
	echo "$UPLOAD_RESPONSE"
	echo ""
	echo "Server logs:"
	tail -20 "$LOG_FILE"
	exit 1
fi
echo ""

# Step 4: Download random binary file
echo "Step 4: Downloading random binary data..."
curl -s "$BASE_URL/$BUCKET/${TEST_RUN_ID}-random.bin" -o "$TEMP_DIR/downloaded-random.bin"
DOWNLOADED_RANDOM_MD5=$(md5sum "$TEMP_DIR/downloaded-random.bin" | cut -d' ' -f1)
echo -e "Downloaded (MD5: $DOWNLOADED_RANDOM_MD5)"

# Verify random file
if [ "$ORIGINAL_MD5" = "$DOWNLOADED_RANDOM_MD5" ]; then
  echo -e "${GREEN}✓ PASS:${NC} Random binary data integrity verified!"
else
  echo -e "${RED}✗ FAIL:${NC} Random binary data corrupted!"
  exit 1
fi
echo ""

# Step 5: Upload problematic binary file
echo "Step 5: Uploading problematic binary data (null bytes, high bytes)..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-problematic.bin" \
  --data-binary "@$TEMP_DIR/problematic.bin" \
  -H "Content-Type: application/octet-stream")
echo "$UPLOAD_RESPONSE" | jq .
echo ""

# Step 6: Download problematic binary file
echo "Step 6: Downloading problematic binary data..."
curl -s "$BASE_URL/$BUCKET/${TEST_RUN_ID}-problematic.bin" -o "$TEMP_DIR/downloaded-problematic.bin"
DOWNLOADED_PROBLEMATIC_MD5=$(md5sum "$TEMP_DIR/downloaded-problematic.bin" | cut -d' ' -f1)
echo -e "Downloaded (MD5: $DOWNLOADED_PROBLEMATIC_MD5)"

# Verify problematic file
if [ "$PROBLEMATIC_MD5" = "$DOWNLOADED_PROBLEMATIC_MD5" ]; then
  echo -e "${GREEN}✓ PASS:${NC} Problematic binary data integrity verified!"
else
  echo -e "${RED}✗ FAIL:${NC} Problematic binary data corrupted!"
  exit 1
fi
echo ""

# Step 7: Byte-by-byte comparison
echo "Step 7: Byte-by-byte comparison..."
if diff "$TEMP_DIR/problematic.bin" "$TEMP_DIR/downloaded-problematic.bin" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ PASS:${NC} Byte-by-byte comparison successful!"
else
  echo -e "${RED}✗ FAIL:${NC} Files differ!"
  exit 1
fi
echo ""

# Step 8: Test PDF upload
echo "Step 8: Testing PDF upload/download..."
# Create a minimal valid PDF file
cat > "$TEMP_DIR/test.pdf" << 'EOF'
%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
306
%%EOF
EOF

PDF_MD5=$(md5sum "$TEMP_DIR/test.pdf" | cut -d' ' -f1)
echo -e "${GREEN}✓${NC} Created test.pdf (MD5: $PDF_MD5)"

# Upload PDF
UPLOAD_PDF_RESPONSE=$(curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.pdf" \
  --data-binary "@$TEMP_DIR/test.pdf" \
  -H "Content-Type: application/pdf")

if echo "$UPLOAD_PDF_RESPONSE" | jq . > /dev/null 2>&1; then
	echo "$UPLOAD_PDF_RESPONSE" | jq .
else
	echo -e "${RED}✗ FAIL:${NC} PDF upload failed with non-JSON response:"
	echo "$UPLOAD_PDF_RESPONSE"
	exit 1
fi

# Download PDF
curl -s "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.pdf" -o "$TEMP_DIR/downloaded.pdf"

DOWNLOADED_PDF_MD5=$(md5sum "$TEMP_DIR/downloaded.pdf" | cut -d' ' -f1)
echo -e "Downloaded PDF (MD5: $DOWNLOADED_PDF_MD5)"

if [ "$PDF_MD5" = "$DOWNLOADED_PDF_MD5" ]; then
  echo -e "${GREEN}✓ PASS:${NC} PDF upload/download successful (content-type: application/pdf)!"
else
  echo -e "${RED}✗ FAIL:${NC} PDF data corrupted!"
  echo "Original:   $PDF_MD5"
  echo "Downloaded: $DOWNLOADED_PDF_MD5"
  exit 1
fi
echo ""

# Step 9: Test image upload (if available)
if command -v convert &> /dev/null; then
  echo "Step 9: Testing image upload..."
  # Create a test image
  convert -size 100x100 xc:blue "$TEMP_DIR/test.jpg"
  
  curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.jpg" \
    --data-binary "@$TEMP_DIR/test.jpg" \
    -H "Content-Type: image/jpeg" > /dev/null
  
  curl -s "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.jpg" -o "$TEMP_DIR/downloaded.jpg"
  
  TEST_MD5=$(md5sum "$TEMP_DIR/test.jpg" | cut -d' ' -f1)
  DOWNLOADED_MD5=$(md5sum "$TEMP_DIR/downloaded.jpg" | cut -d' ' -f1)
  
  if [ "$TEST_MD5" = "$DOWNLOADED_MD5" ]; then
    echo -e "${GREEN}✓ PASS:${NC} Image upload/download successful!"
  else
    echo -e "${RED}✗ FAIL:${NC} Image data corrupted!"
    exit 1
  fi
  echo ""
fi

# Step 10: Create public URL
echo "Step 10: Creating public URL..."
PUBLIC_URL_RESPONSE=$(curl -s -X POST "$BASE_URL/$BUCKET/${TEST_RUN_ID}-random.bin/public-url")
echo "$PUBLIC_URL_RESPONSE" | jq .
PUBLIC_URL=$(echo "$PUBLIC_URL_RESPONSE" | jq -r .url)
echo -e "${GREEN}✓${NC} Public URL: $PUBLIC_URL"
echo ""

# Step 11: Cleanup - delete test objects
echo "Step 11: Cleaning up..."
curl -s -X DELETE "$BASE_URL/$BUCKET/${TEST_RUN_ID}-random.bin" > /dev/null
curl -s -X DELETE "$BASE_URL/$BUCKET/${TEST_RUN_ID}-problematic.bin" > /dev/null
curl -s -X DELETE "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.pdf" > /dev/null
[ -f "$TEMP_DIR/test.jpg" ] && curl -s -X DELETE "$BASE_URL/$BUCKET/${TEST_RUN_ID}-test.jpg" > /dev/null
echo -e "${GREEN}✓${NC} Deleted test objects"
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Binary data can be uploaded and downloaded without corruption."
echo "========================================="
echo ""

print_result
