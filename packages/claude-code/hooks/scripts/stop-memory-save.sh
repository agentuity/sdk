#!/usr/bin/env bash
# Stop hook: Request memory save before session ends (interactive mode only).
#
# In INTERACTIVE mode: blocks the first stop to request memory save via Memory agent.
# In HEADLESS mode (-p): skips entirely — session-end.sh handles KV save directly.
#
# Exit 0 = let Claude stop normally.
# Exit 2 + JSON with decision:block = prevent stop and inject instructions.

INPUT=$(cat)

# Check if agentuity CLI is available — if not, skip memory save
if ! command -v agentuity &>/dev/null; then
  exit 0
fi

# Detect headless mode: check if CLAUDE_CODE_HEADLESS is set, or if
# the session was started with -p (no TTY on parent's stdin).
# In headless mode, session-end.sh handles memory save directly via KV.
if [ "${CLAUDE_CODE_HEADLESS:-}" = "1" ] || [ "${CLAUDE_NON_INTERACTIVE:-}" = "1" ]; then
  exit 0
fi

# Also detect headless by checking if the parent process has no TTY
if ! kill -0 $PPID 2>/dev/null || [ ! -t 0 ] 2>/dev/null; then
  # Can't reliably detect, but hooks don't have a TTY in either mode.
  # Use the marker-only approach and keep the block minimal.
  :
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

# Block the stop and request memory save.
# Keep the instruction focused on a SINGLE direct KV save command to avoid
# complex agent delegation that can hang in some modes.
cat <<EOF
{
  "decision": "block",
  "reason": "Before ending, save a brief session summary. Run: agentuity cloud kv set agentuity-opencode-memory 'session:cc:$(date +%s)' '{\"branch\":\"${GIT_BRANCH}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"summary\":\"<2-3 sentence summary of what was accomplished>\"}' --region use"
}
EOF
exit 2
