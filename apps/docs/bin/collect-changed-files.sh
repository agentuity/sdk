#!/bin/bash
set -euo pipefail

# collect-changed-files.sh <before_commit> <after_commit>
# Outputs newline-separated list of changed MDX files (relative to apps/docs/src/web/content/)
# Files prefixed with REMOVED: were deleted.
# Must be run from the repo root.

CONTENT_DIR="apps/docs/src/web/content"

usage() {
    echo "Usage: $0 <before_commit> <after_commit>" >&2
    echo "Example: $0 HEAD~1 HEAD" >&2
    exit 1
}

if [ $# -ne 2 ]; then
    usage
fi

BEFORE_COMMIT="$1"
AFTER_COMMIT="$2"

# Validate commits exist
if ! git rev-parse --verify "$BEFORE_COMMIT" >/dev/null 2>&1; then
    echo "Error: Invalid before commit: $BEFORE_COMMIT" >&2
    exit 1
fi

if ! git rev-parse --verify "$AFTER_COMMIT" >/dev/null 2>&1; then
    echo "Error: Invalid after commit: $AFTER_COMMIT" >&2
    exit 1
fi

echo "Collecting changed files between $BEFORE_COMMIT and $AFTER_COMMIT" >&2

# Get changed files (excluding deleted)
echo "Changed files:" >&2
git diff --name-only "$BEFORE_COMMIT" "$AFTER_COMMIT" -- "${CONTENT_DIR}/**/*.mdx" | \
    (grep "^${CONTENT_DIR}/" || true) | \
    sed "s|^${CONTENT_DIR}/||" | \
    while read -r file; do
        if [ -n "$file" ] && [ -f "${CONTENT_DIR}/$file" ]; then
            echo "$file"
            echo "  + $file" >&2
        fi
    done

# Get removed files
echo "Removed files:" >&2
git diff --name-only --diff-filter=D "$BEFORE_COMMIT" "$AFTER_COMMIT" -- "${CONTENT_DIR}/**/*.mdx" | \
    (grep "^${CONTENT_DIR}/" || true) | \
    sed "s|^${CONTENT_DIR}/||" | \
    while read -r file; do
        if [ -n "$file" ]; then
            echo "REMOVED:$file"
            echo "  - $file" >&2
        fi
    done
