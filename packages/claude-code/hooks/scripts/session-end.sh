#!/usr/bin/env bash
# Session end hook: Save session context to Agentuity Cloud KV (best-effort).
#
# Receives JSON on stdin with:
#   - session_id: session identifier
#   - transcript_path: path to conversation JSONL file
#   - cwd: working directory
#   - reason: why session ended
#
# Reads the transcript, extracts key context, and saves to KV directly.
# This works in BOTH interactive and headless (-p) mode.

set -uo pipefail

# Read input from stdin
INPUT=$(cat)

# Check CLI availability
if ! command -v agentuity &>/dev/null; then
  exit 0
fi

# Extract fields from input JSON
if command -v jq &>/dev/null; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
  TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
  REASON=$(echo "$INPUT" | jq -r '.reason // empty' 2>/dev/null)
else
  SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  TRANSCRIPT_PATH=$(echo "$INPUT" | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  REASON=$(echo "$INPUT" | grep -o '"reason"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
fi

# Skip if no session ID or transcript
if [ -z "$SESSION_ID" ] || [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# Get git branch
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# Extract the last N assistant messages from the transcript JSONL
# Each line is a JSON object with role, content, etc.
TRANSCRIPT_TAIL=""
if command -v jq &>/dev/null; then
  # Get last 10 assistant messages as a summary
  TRANSCRIPT_TAIL=$(tail -100 "$TRANSCRIPT_PATH" 2>/dev/null | jq -r 'select(.role == "assistant" and .type == "text") | .content // empty' 2>/dev/null | tail -20 | head -c 4000)
fi

# If we couldn't extract with jq, get raw tail
if [ -z "$TRANSCRIPT_TAIL" ]; then
  TRANSCRIPT_TAIL=$(tail -20 "$TRANSCRIPT_PATH" 2>/dev/null | head -c 4000)
fi

# Build session metadata
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create a session record
SESSION_RECORD=$(cat <<JSONEOF
{
  "sessionId": "$SESSION_ID",
  "branch": "$GIT_BRANCH",
  "endReason": "$REASON",
  "timestamp": "$TIMESTAMP",
  "source": "claude-code",
  "tail": $(echo "$TRANSCRIPT_TAIL" | jq -Rs . 2>/dev/null || echo "\"transcript unavailable\"")
}
JSONEOF
)

# Save to KV (best-effort, don't fail the session)
agentuity cloud kv set agentuity-opencode-memory "session:cc:${SESSION_ID}" "$SESSION_RECORD" --region use 2>/dev/null || true

exit 0
