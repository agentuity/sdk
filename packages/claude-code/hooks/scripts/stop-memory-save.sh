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

# Block the stop and request agentic memory save via Memory agent.
# The Memory agent has full reasoning capabilities: entity extraction,
# corrections identification, Vector upsert, and structured KV storage.
#
# IMPORTANT: We use the Task tool to delegate to Memory agent (subagent),
# NOT Lead, to avoid complex multi-agent orchestration that can hang.
cat <<EOF
{
  "decision": "block",
  "reason": "Before ending this session, you MUST save session context to persistent memory. Use the Task tool to delegate to the Memory agent:\n\nTask tool parameters:\n- subagent_type: agentuity-coder:agentuity-coder-memory\n- description: Save session memory\n- prompt: \"Memorialize this session. You are being invoked automatically at session end. Review the conversation above and perform a full session memorialization:\\n\\n1. Create a session summary using the Session Summary Template (PROBLEM, CONTEXT, DECISIONS, CORRECTIONS, SOLUTIONS, PATTERNS, FILES, OPEN QUESTIONS)\\n2. Extract and store any corrections/mistakes as high-priority KV entries (correction:{name})\\n3. Store any key decisions (decision:{name})\\n4. Store any reusable patterns (pattern:{name})\\n5. Upsert the FULL session document to Vector storage for semantic search\\n6. Apply reasoning to extract conclusions (explicit, deductive, inductive, abductive) and update entity representations\\n7. Current branch: ${GIT_BRANCH}\\n\\nDo NOT ask questions. Summarize and store everything you can from the conversation history. Prioritize corrections and decisions.\"\n\nAfter the Memory agent completes, you may stop."
}
EOF
exit 2
