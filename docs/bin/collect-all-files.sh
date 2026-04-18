#!/bin/bash
set -euo pipefail
trap "" PIPE

# collect-all-files.sh
# Outputs newline-separated list of all MDX files (relative to docs/src/web/content/)
# Must be run from the repo root.

CONTENT_DIR="docs/src/web/content"

echo "Collecting all MDX files for full sync" >&2

if [ ! -d "$CONTENT_DIR" ]; then
    echo "Error: $CONTENT_DIR directory not found. Run from repo root." >&2
    exit 1
fi

# Find all MDX files
find "$CONTENT_DIR" -type f -name "*.mdx" | \
    sed "s|^${CONTENT_DIR}/||" | \
    sort | \
    while read -r file; do
        if [ -n "$file" ] && [ -f "${CONTENT_DIR}/$file" ]; then
            echo "$file"
            echo "  found: $file" >&2
        fi
    done

# Count and report
file_count=$(find "$CONTENT_DIR" -type f -name "*.mdx" | wc -l)
echo "Total files found: $file_count" >&2
