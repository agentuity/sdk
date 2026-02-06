#!/usr/bin/env bash
# Stop hook: Request memory save before session ends.
#
# On the first stop per session, blocks the stop and asks Claude to save
# session context to memory. Uses a temp file to track whether we've
# already requested a save (so we don't loop forever).
#
# Exit 0 = let Claude stop normally.
# Exit 2 + JSON with decision:block = prevent stop and inject instructions.

INPUT=$(cat)

# Check if agentuity CLI is available — if not, skip memory save
if ! command -v agentuity &>/dev/null; then
  exit 0
fi

# Use a session-specific marker file to track save state.
# PPID is the Claude Code process that spawns hooks — consistent within a session.
MARKER_DIR="/tmp/agentuity-coder-memory"
mkdir -p "$MARKER_DIR" 2>/dev/null
MARKER_FILE="$MARKER_DIR/saved-$PPID"

# If we've already requested a save this session, let Claude stop
if [ -f "$MARKER_FILE" ]; then
  exit 0
fi

# Mark that we've requested a save
touch "$MARKER_FILE"

# Clean up old markers (older than 24h)
find "$MARKER_DIR" -name 'saved-*' -mtime +1 -delete 2>/dev/null || true

# Get git branch for context
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# Block the stop and request memory save
cat <<EOF
{
  "decision": "block",
  "reason": "Before ending this session, save important context to memory for future recall. Use the Memory agent to persist:\n1. Session summary (what was accomplished)\n2. Key decisions made\n3. Corrections or lessons learned\n4. Any patterns discovered\n\nSave to KV namespace 'agentuity-opencode-memory'. Include branch: ${GIT_BRANCH}. After saving, you can stop."
}
EOF
exit 2
