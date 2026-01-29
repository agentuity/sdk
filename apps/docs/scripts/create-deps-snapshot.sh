#!/bin/bash
# Build and upload SDK Explorer snapshot with pre-bundled run scripts.
#
# Usage:
#   cd apps/docs
#   source .env && ./scripts/create-deps-snapshot.sh

set -e
cd "$(dirname "$0")/.."

if [ -z "$AGENTUITY_ORG_ID" ]; then
  echo "Error: AGENTUITY_ORG_ID not set. Run: source .env"
  exit 1
fi

bun install && bun run scripts/bundle-run-scripts.ts

AGENTUITY_REGION=usc agentuity cloud sandbox snapshot build \
  --org-id "$AGENTUITY_ORG_ID" --confirm --public .
