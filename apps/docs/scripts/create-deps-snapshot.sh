#!/bin/bash
# Create SDK Explorer snapshot with dependencies and agents pre-installed.
#
# Why use this script instead of `agentuity cloud sandbox snapshot build`?
# The declarative YAML build (agentuity-snapshot.yaml) respects .gitignore,
# which excludes node_modules. This script works around that by creating a
# sandbox, installing dependencies inside it, then snapshotting.
#
# Includes:
# - npm dependencies (published versions, not workspace refs)
# - src/agent/** (agent implementations)
#
# Excludes (injected at runtime via sandboxRun files option):
# - src/run/** (wrapper scripts)
# - src/web/**, src/api/** (server-side code)
#
# Usage:
#   cd apps/docs
#   source .env && ./scripts/create-deps-snapshot.sh
#
# After running, update .env with the printed SANDBOX_SNAPSHOT_ID.

set -e

# Check for org ID
if [ -z "$AGENTUITY_ORG_ID" ]; then
  echo "Error: AGENTUITY_ORG_ID not set. Run: source .env"
  exit 1
fi

echo "Using org: $AGENTUITY_ORG_ID"
echo "Creating sandbox..."
SANDBOX_ID=$(agentuity cloud sandbox create \
  --runtime agentuity:latest \
  --network \
  --idle-timeout 15m \
  --org-id "$AGENTUITY_ORG_ID" \
  2>&1 | grep -oE 'sbx_[a-f0-9]+')

if [ -z "$SANDBOX_ID" ]; then
  echo "Failed to create sandbox"
  exit 1
fi

echo "Sandbox created: $SANDBOX_ID"

# Cleanup on exit
cleanup() {
  echo "Cleaning up sandbox..."
  agentuity cloud sandbox delete "$SANDBOX_ID" --confirm --org-id "$AGENTUITY_ORG_ID" 2>/dev/null || true
}
trap cleanup EXIT

# Create package.json with dependencies
cat > /tmp/deps-package.json << 'EOF'
{
  "name": "sdk-explorer-deps",
  "type": "module",
  "dependencies": {
    "@agentuity/runtime": "latest",
    "@agentuity/schema": "latest",
    "@agentuity/server": "latest",
    "@agentuity/core": "latest",
    "ai": "latest",
    "@ai-sdk/openai": "latest",
    "@ai-sdk/anthropic": "latest",
    "@ai-sdk/google": "latest",
    "@ai-sdk/groq": "latest",
    "zod": "latest"
  }
}
EOF

echo "Uploading package.json..."
agentuity cloud sandbox cp --org-id "$AGENTUITY_ORG_ID" /tmp/deps-package.json "$SANDBOX_ID":/home/agentuity/package.json

echo "Installing dependencies (this may take a minute)..."
agentuity cloud sandbox exec --org-id "$AGENTUITY_ORG_ID" "$SANDBOX_ID" -- bun install

echo "Uploading agent source files..."
agentuity cloud sandbox cp --org-id "$AGENTUITY_ORG_ID" -r src/agent "$SANDBOX_ID":/home/agentuity/src/agent

echo "Creating snapshot..."
agentuity cloud sandbox snapshot create "$SANDBOX_ID" \
  --org-id "$AGENTUITY_ORG_ID" \
  --name sdk-explorer \
  --description "SDK Explorer with agents and dependencies pre-installed" \
  --tag latest

echo ""
echo "========================================"
echo "Snapshot created! Copy the ID above to your .env:"
echo "SANDBOX_SNAPSHOT_ID=<snapshot_id>"
echo "========================================"
