#!/usr/bin/env bash
# Session start hook: Gather Agentuity context
set -euo pipefail

# Find agentuity.json by walking up directories
find_agentuity_json() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/agentuity.json" ]; then
      echo "$dir/agentuity.json"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

# Initialize context
CONTEXT="{}"

# Check CLI availability
if command -v agentuity &>/dev/null; then
  CLI_AVAILABLE=true
else
  CLI_AVAILABLE=false
fi

# Read agentuity.json
AGENTUITY_JSON=""
if AGENTUITY_JSON_PATH=$(find_agentuity_json); then
  AGENTUITY_JSON=$(cat "$AGENTUITY_JSON_PATH" 2>/dev/null || echo "{}")
fi

# Extract project info
PROJECT_ID=$(echo "$AGENTUITY_JSON" | grep -o '"projectId"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"projectId"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/' || echo "")
ORG_ID=$(echo "$AGENTUITY_JSON" | grep -o '"orgId"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"orgId"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/' || echo "")

# If no orgId in agentuity.json, try CLI profile
if [ -z "$ORG_ID" ] && [ -f "$HOME/.config/agentuity/production.yaml" ]; then
  ORG_ID=$(grep 'orgId' "$HOME/.config/agentuity/production.yaml" 2>/dev/null | head -1 | sed 's/.*orgId:[[:space:]]*//' | tr -d '"' || echo "")
fi

# Get user info from CLI
USER_INFO=""
if [ "$CLI_AVAILABLE" = true ]; then
  USER_INFO=$(agentuity auth whoami --json 2>/dev/null || echo "")
fi

# Get git info
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "unknown")

# Output context
cat <<EOF
{
  "agentuity": {
    "cliAvailable": $CLI_AVAILABLE,
    "projectId": "$PROJECT_ID",
    "orgId": "$ORG_ID",
    "configPath": "${AGENTUITY_JSON_PATH:-}",
    "userInfo": ${USER_INFO:-null}
  },
  "git": {
    "branch": "$GIT_BRANCH",
    "remote": "$GIT_REMOTE"
  }
}
EOF
