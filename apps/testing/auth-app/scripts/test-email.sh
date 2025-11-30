#!/bin/bash


set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Email Test"
echo "========================================="
echo ""

TEST_RUN_ID="test-$(date +%s%N)"
echo "Test Run ID: $TEST_RUN_ID"
echo ""

PORT="${PORT:-3500}"

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)

trap cleanup EXIT

# Start server if needed
start_server_if_needed

echo "Test 1: Plain text email (default response)..."
PLAINTEXT_EMAIL="From: sender@example.com
To: test-plaintext@example.com
Subject: Test Plain Text Email
Date: $(date -R)
Message-ID: <${TEST_RUN_ID}-plaintext@example.com>
Content-Type: text/plain; charset=utf-8

This is a plain text email message.
It has multiple lines.
And tests basic email parsing."

PLAINTEXT_HASH="a3eec988c9891d83b11896823d65731bde1a7ba72f2f0fe0e094c3d909681690"
PLAINTEXT_RESPONSE=$(curl -s -X POST "http://localhost:$PORT/agent/email/$PLAINTEXT_HASH" \
  -H "Content-Type: message/rfc822" \
  --data-binary "$PLAINTEXT_EMAIL")

PLAINTEXT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/agent/email/$PLAINTEXT_HASH" \
  -H "Content-Type: message/rfc822" \
  --data-binary "$PLAINTEXT_EMAIL")

if [ "$PLAINTEXT_STATUS" = "200" ] && [ "$PLAINTEXT_RESPONSE" = "OK" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Plain text email processed with default 200 OK response"
else
	echo -e "${RED}✗ FAIL:${NC} Plain text email failed (status: $PLAINTEXT_STATUS, response: $PLAINTEXT_RESPONSE)"
	exit 1
fi
echo ""

echo "Test 2: HTML email (custom text response)..."
HTML_EMAIL="From: sender@example.com
To: test-html@example.com
Subject: Test HTML Email
Date: $(date -R)
Message-ID: <${TEST_RUN_ID}-html@example.com>
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html>
<head><title>Test Email</title></head>
<body>
<h1>Hello World</h1>
<p>This is an <strong>HTML</strong> email message.</p>
<p>It contains <em>formatted</em> content.</p>
</body>
</html>"

HTML_HASH="40c0a4305d5ec14e60541a04b3ccade940c9a4ebafe7ba4be2193ea8f5fc5758"
HTML_RESPONSE=$(curl -s -X POST "http://localhost:$PORT/agent/email/$HTML_HASH" \
  -H "Content-Type: message/rfc822" \
  --data-binary "$HTML_EMAIL")

HTML_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/agent/email/$HTML_HASH" \
  -H "Content-Type: message/rfc822" \
  --data-binary "$HTML_EMAIL")

if [ "$HTML_STATUS" = "200" ] && echo "$HTML_RESPONSE" | grep -q "Processed HTML email from sender@example.com"; then
	echo -e "${GREEN}✓ PASS:${NC} HTML email processed with custom text response"
	echo "  Response: $HTML_RESPONSE"
else
	echo -e "${RED}✗ FAIL:${NC} HTML email failed (status: $HTML_STATUS, response: $HTML_RESPONSE)"
	exit 1
fi
echo ""

echo "Test 3: Mixed/multipart email with attachments (custom JSON response)..."
BOUNDARY="----=_Part_${TEST_RUN_ID}"
MIXED_EMAIL="From: sender@example.com
To: test-mixed@example.com
Subject: Test Mixed Email with Attachments
Date: $(date -R)
Message-ID: <${TEST_RUN_ID}-mixed@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary=\"${BOUNDARY}\"

--${BOUNDARY}
Content-Type: multipart/alternative; boundary=\"${BOUNDARY}-alt\"

--${BOUNDARY}-alt
Content-Type: text/plain; charset=utf-8

This is the plain text version of the email.

--${BOUNDARY}-alt
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html>
<body>
<p>This is the <strong>HTML</strong> version of the email.</p>
</body>
</html>
--${BOUNDARY}-alt--

--${BOUNDARY}
Content-Type: text/plain; name=\"document.txt\"
Content-Disposition: attachment; filename=\"document.txt\"
Content-Transfer-Encoding: base64

VGhpcyBpcyBhIHRlc3QgZG9jdW1lbnQgYXR0YWNobWVudC4K

--${BOUNDARY}
Content-Type: image/png; name=\"image.png\"
Content-Disposition: attachment; filename=\"image.png\"
Content-Transfer-Encoding: base64

iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==

--${BOUNDARY}--"

MIXED_HASH="483374aba43cfe631763385a1a67ed0a876e1d0516c61486d2879ec0f68ca6ef"
MIXED_RESPONSE=$(curl -s -X POST "http://localhost:$PORT/agent/email/$MIXED_HASH" \
  -H "Content-Type: message/rfc822" \
  --data-binary "$MIXED_EMAIL")

MIXED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/agent/email/$MIXED_HASH" \
  -H "Content-Type: message/rfc822" \
  --data-binary "$MIXED_EMAIL")

if [ "$MIXED_STATUS" = "200" ]; then
	if echo "$MIXED_RESPONSE" | jq . > /dev/null 2>&1; then
		STATUS_FIELD=$(echo "$MIXED_RESPONSE" | jq -r .status)
		ATTACHMENT_COUNT=$(echo "$MIXED_RESPONSE" | jq -r .attachmentCount)
		HAS_TEXT=$(echo "$MIXED_RESPONSE" | jq -r .hasText)
		HAS_HTML=$(echo "$MIXED_RESPONSE" | jq -r .hasHtml)
		
		if [ "$STATUS_FIELD" = "processed" ] && [ "$ATTACHMENT_COUNT" = "2" ] && [ "$HAS_TEXT" = "true" ] && [ "$HAS_HTML" = "true" ]; then
			echo -e "${GREEN}✓ PASS:${NC} Mixed email processed with custom JSON response"
			echo "  Attachments: $ATTACHMENT_COUNT"
			echo "  Has text: $HAS_TEXT, Has HTML: $HAS_HTML"
		else
			echo -e "${RED}✗ FAIL:${NC} Mixed email response validation failed"
			echo "  Expected: status=processed, attachmentCount=2, hasText=true, hasHtml=true"
			echo "  Got: status=$STATUS_FIELD, attachmentCount=$ATTACHMENT_COUNT, hasText=$HAS_TEXT, hasHtml=$HAS_HTML"
			exit 1
		fi
	else
		echo -e "${RED}✗ FAIL:${NC} Mixed email response is not valid JSON"
		echo "  Response: $MIXED_RESPONSE"
		exit 1
	fi
else
	echo -e "${RED}✗ FAIL:${NC} Mixed email failed (status: $MIXED_STATUS)"
	exit 1
fi
echo ""

echo "Test 4: Invalid Content-Type (should return 400)..."
INVALID_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/agent/email/$PLAINTEXT_HASH" \
  -H "Content-Type: text/plain" \
  --data-binary "$PLAINTEXT_EMAIL")

if [ "$INVALID_RESPONSE" = "400" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Invalid Content-Type rejected with 400"
else
	echo -e "${RED}✗ FAIL:${NC} Invalid Content-Type not rejected (status: $INVALID_RESPONSE)"
	exit 1
fi
echo ""

echo "Test 5: Case-insensitive Content-Type header..."
CASE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/agent/email/$PLAINTEXT_HASH" \
  -H "Content-Type: MESSAGE/RFC822" \
  --data-binary "$PLAINTEXT_EMAIL")

if [ "$CASE_RESPONSE" = "200" ]; then
	echo -e "${GREEN}✓ PASS:${NC} Case-insensitive Content-Type accepted"
else
	echo -e "${RED}✗ FAIL:${NC} Case-insensitive Content-Type rejected (status: $CASE_RESPONSE)"
	exit 1
fi
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Email routing working correctly:"
echo "  ✓ Plain text emails"
echo "  ✓ HTML emails"
echo "  ✓ Mixed/multipart emails with attachments"
echo "  ✓ Default and custom responses"
echo "  ✓ Content-Type validation"
echo "========================================="
echo ""

print_result
