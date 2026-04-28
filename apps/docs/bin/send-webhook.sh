#!/bin/bash
set -euo pipefail

# send-webhook.sh <webhook_url> [auth_token]
# Reads JSON payload from stdin, sends to webhook with retries and exponential backoff.

usage() {
    echo "Usage: $0 <webhook_url> [auth_token]" >&2
    echo "Example: $0 'https://example.com/webhook' 'Bearer token123'" >&2
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

WEBHOOK_URL="$1"
AUTH_TOKEN="${2:-}"
MAX_RETRIES=3
RETRY_DELAY=2

echo "Sending webhook to $WEBHOOK_URL" >&2

# Create temporary file for payload
TEMP_FILE=$(mktemp)
trap 'rm -f "$TEMP_FILE"' EXIT

# Read payload from stdin to temporary file
cat > "$TEMP_FILE"

if [ ! -s "$TEMP_FILE" ]; then
    echo "Error: No payload received from stdin" >&2
    exit 1
fi

# Validate JSON
if ! jq . "$TEMP_FILE" >/dev/null 2>&1; then
    echo "Error: Invalid JSON payload" >&2
    exit 1
fi

echo "Payload size: $(wc -c < "$TEMP_FILE") bytes" >&2

# Build curl command using temporary file
curl_args=(
    --http1.1
    --max-time 90
    -X POST
    -H "Content-Type: application/json"
    --data-binary "@$TEMP_FILE"
    --fail
    --show-error
    --silent
)

# Add auth header if provided
if [ -n "$AUTH_TOKEN" ]; then
    curl_args+=(-H "Authorization: $AUTH_TOKEN")
fi

# Retry logic with exponential backoff
for attempt in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $attempt/$MAX_RETRIES..." >&2

    if response=$(curl "${curl_args[@]}" "$WEBHOOK_URL" 2>&1); then
        echo "Success! Response:" >&2
        echo "$response" >&2
        echo "$response"
        exit 0
    else
        response_json=$(printf '%s\n' "$response" | tail -n 1)
        if [ -n "$response_json" ] && echo "$response_json" | jq -e '.status == "ok" and .stats' >/dev/null 2>&1; then
            echo "Received success response after curl transport error:" >&2
            echo "$response_json" >&2
            echo "$response_json"
            exit 0
        fi

        echo "Attempt $attempt failed: $response" >&2

        if [ $attempt -lt $MAX_RETRIES ]; then
            echo "Retrying in ${RETRY_DELAY}s..." >&2
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))
        fi
    fi
done

echo "Error: All $MAX_RETRIES attempts failed" >&2
exit 1
