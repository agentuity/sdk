#!/bin/bash
set -euo pipefail

# send-batched.sh <repo_name> <mode> <webhook_url> [auth_token]
# Reads file paths from stdin, splits into batches, sends each via build-payload + send-webhook.
# Aggregates stats across batches and reports a summary.
#
# Environment:
#   BATCH_SIZE - files per request (default: 10)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    echo "Usage: $0 <repo_name> <mode> <webhook_url> [auth_token]" >&2
    echo "Example: $0 'owner/repo' incremental 'https://example.com/api/process-docs' 'Bearer token'" >&2
    exit 1
}

if [ $# -lt 3 ]; then
    usage
fi

REPO_NAME="$1"
MODE="$2"
WEBHOOK_URL="$3"
AUTH_TOKEN="${4:-}"
BATCH_SIZE="${BATCH_SIZE:-10}"

# Validate BATCH_SIZE is a positive integer
if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [ "$BATCH_SIZE" -eq 0 ]; then
    echo "Error: BATCH_SIZE must be a positive integer, got '$BATCH_SIZE'" >&2
    exit 1
fi

# Read all file paths into an array (handles EOF without trailing newline)
all_files=()
while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$line" ]; then
        all_files+=("$line")
    fi
done

total_files=${#all_files[@]}
if [ "$total_files" -eq 0 ]; then
    echo "No files to process" >&2
    exit 0
fi

total_batches=$(( (total_files + BATCH_SIZE - 1) / BATCH_SIZE ))
echo "Processing $total_files files in $total_batches batches (batch size: $BATCH_SIZE)" >&2

# Stats accumulators
total_processed=0
total_deleted=0
total_errors=0
failed_batches=0
error_files=""

for (( i=0; i<total_files; i+=BATCH_SIZE )); do
    batch_num=$(( i / BATCH_SIZE + 1 ))
    batch_end=$(( i + BATCH_SIZE ))
    if [ "$batch_end" -gt "$total_files" ]; then
        batch_end=$total_files
    fi
    batch_count=$(( batch_end - i ))

    echo "" >&2
    echo "Batch $batch_num/$total_batches: sending $batch_count files..." >&2

    # Write batch file paths to temp file
    BATCH_FILE=$(mktemp)
    trap 'rm -f "$BATCH_FILE"' EXIT
    for (( j=i; j<batch_end; j++ )); do
        echo "${all_files[$j]}" >> "$BATCH_FILE"
    done

    # Build payload and send. Stderr (progress logs) passes through to console.
    # Only stdout (the JSON response) is captured in $response.
    if response=$(cat "$BATCH_FILE" | "$SCRIPT_DIR/build-payload.sh" "$REPO_NAME" "$MODE" | "$SCRIPT_DIR/send-webhook.sh" "$WEBHOOK_URL" "$AUTH_TOKEN"); then
        # Validate response contains stats before extracting
        if echo "$response" | jq -e '.stats and (.stats.processed | type == "number")' >/dev/null 2>&1; then
            batch_processed=$(echo "$response" | jq -r '.stats.processed')
            batch_deleted=$(echo "$response" | jq -r '.stats.deleted')
            batch_errors=$(echo "$response" | jq -r '.stats.errors')
            batch_error_files=$(echo "$response" | jq -r '.stats.errorFiles // [] | join(", ")')

            total_processed=$(( total_processed + batch_processed ))
            total_deleted=$(( total_deleted + batch_deleted ))
            total_errors=$(( total_errors + batch_errors ))

            if [ -n "$batch_error_files" ]; then
                if [ -n "$error_files" ]; then
                    error_files="$error_files, $batch_error_files"
                else
                    error_files="$batch_error_files"
                fi
            fi

            echo "Batch $batch_num/$total_batches: $batch_processed processed, $batch_deleted deleted, $batch_errors errors" >&2
        else
            echo "Batch $batch_num/$total_batches: FAILED (unexpected response: $response)" >&2
            failed_batches=$(( failed_batches + 1 ))
            total_errors=$(( total_errors + batch_count ))
        fi
    else
        echo "Batch $batch_num/$total_batches: FAILED" >&2
        failed_batches=$(( failed_batches + 1 ))
        total_errors=$(( total_errors + batch_count ))
    fi

    rm -f "$BATCH_FILE"
done

# Summary
echo "" >&2
echo "──────────────────────────────" >&2
echo "Sync complete:" >&2
echo "  Processed: $total_processed" >&2
echo "  Deleted:   $total_deleted" >&2
echo "  Errors:    $total_errors" >&2
echo "  Failed batches: $failed_batches" >&2
if [ -n "$error_files" ]; then
    echo "  Error files: $error_files" >&2
fi
echo "──────────────────────────────" >&2

# Exit with failure if any errors
if [ "$total_errors" -gt 0 ] || [ "$failed_batches" -gt 0 ]; then
    exit 1
fi
