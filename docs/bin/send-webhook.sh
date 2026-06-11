#!/bin/bash
set -euo pipefail

# send-webhook.sh <webhook_url> [auth_token]
# Reads JSON payload from stdin, sends to webhook with retries and exponential backoff.
#
# Environment:
#   MAX_RETRIES     - positive attempts before giving up (default: 3)
#   RETRY_DELAY     - initial backoff in seconds, doubles per attempt (default: 2)
#   MAX_RETRY_DELAY - backoff ceiling in seconds (default: 60)

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
MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY="${RETRY_DELAY:-2}"
MAX_RETRY_DELAY="${MAX_RETRY_DELAY:-60}"

# Invalid values would silently disable the retry loop or backoff cap; fail
# loudly instead, like BATCH_SIZE validation in send-batched.sh.
if ! [[ "$MAX_RETRIES" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: MAX_RETRIES must be a positive integer, got '$MAX_RETRIES'" >&2
    exit 1
fi

for var in RETRY_DELAY MAX_RETRY_DELAY; do
    if ! [[ "${!var}" =~ ^[0-9]+$ ]]; then
        echo "Error: $var must be a non-negative integer, got '${!var}'" >&2
        exit 1
    fi
done

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
        if [ -n "$response_json" ] && echo "$response_json" | jq -e '.status == "ok" and (.stats.processed | type == "number")' >/dev/null 2>&1; then
            echo "Received success response after curl transport error:" >&2
            echo "$response_json" >&2
            echo "$response_json"
            exit 0
        fi

        echo "Attempt $attempt failed: $response" >&2

        # curl --fail reports HTTP errors as 'curl: (22) ... returned error: NNN'.
        # A 4xx (other than 408/429) is deterministic, so retrying it only burns
        # the retry window without ever succeeding.
        status=$(printf '%s\n' "$response" | grep -oE 'returned error: [0-9]{3}' | grep -oE '[0-9]{3}' | tail -n 1 || true)
        case "$status" in
            408 | 429) ;;
            4??)
                echo "Error: HTTP $status is not retryable, giving up" >&2
                exit 1
                ;;
        esac

        if [ $attempt -lt $MAX_RETRIES ]; then
            echo "Retrying in ${RETRY_DELAY}s..." >&2
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))
            if [ "$RETRY_DELAY" -gt "$MAX_RETRY_DELAY" ]; then
                RETRY_DELAY=$MAX_RETRY_DELAY
            fi
        fi
    fi
done

echo "Error: All $MAX_RETRIES attempts failed" >&2
exit 1
