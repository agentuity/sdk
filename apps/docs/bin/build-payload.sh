#!/bin/bash
set -euo pipefail

# build-payload.sh <repo_name> [mode]
# Reads file paths from stdin, builds JSON payload with base64-encoded content.
# mode: "incremental" (default) or "full"
# Must be run from the repo root.

CONTENT_DIR="apps/docs/src/web/content"

usage() {
    echo "Usage: $0 <repo_name> [mode]" >&2
    echo "Example: $0 'owner/repo' incremental" >&2
    echo "Modes: incremental (default), full" >&2
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

REPO_NAME="$1"
MODE="${2:-incremental}"

echo "Building $MODE sync payload for $REPO_NAME" >&2

# Read all file paths into arrays
changed_files=()
removed_files=()

while IFS= read -r file; do
    if [ -z "$file" ]; then
        continue
    fi

    if [[ "$file" == REMOVED:* ]]; then
        # Remove the REMOVED: prefix
        removed_file="${file#REMOVED:}"
        removed_files+=("$removed_file")
        echo "  removed: $removed_file" >&2
    else
        changed_files+=("$file")
        echo "  changed: $file" >&2
    fi
done

echo "Processing ${#changed_files[@]} changed files and ${#removed_files[@]} removed files" >&2

# For full mode, all files should be removed first (delete-then-reinsert)
if [ "$MODE" = "full" ]; then
    removed_files=("${changed_files[@]}")
    echo "Full mode: treating all files as removed for refresh" >&2
fi

# Start building JSON
echo "{"
echo "  \"repo\": \"$REPO_NAME\","

# Build changed files array
echo "  \"changed\": ["
first=true
for file in "${changed_files[@]}"; do
    if [ -f "${CONTENT_DIR}/$file" ]; then
        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi

        # Read file content and base64 encode (tr -d '\n' for cross-platform compat)
        content=$(base64 < "${CONTENT_DIR}/$file" | tr -d '\n')

        echo -n "    {"
        echo -n "\"path\": \"$file\", "
        echo -n "\"content\": \"$content\""
        echo -n "}"
    fi
done
echo ""
echo "  ],"

# Build removed files array
echo "  \"removed\": ["
first=true
for file in "${removed_files[@]}"; do
    if [ "$first" = true ]; then
        first=false
    else
        echo ","
    fi
    echo -n "    \"$file\""
done
echo ""
echo "  ]"
echo "}"

echo "Payload build complete" >&2
