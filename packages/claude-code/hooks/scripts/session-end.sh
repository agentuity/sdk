#!/usr/bin/env bash
# Session end hook: Save session context via TWO paths:
#
# PATH 1 (Immediate): Structured KV save — session metadata + conversation extract.
#   Fast, reliable, always works. Extracts actual text content from transcript.
#
# PATH 2 (Async/Agentic): Spawn background `claude -p` with the plugin loaded.
#   Delegates to the Memory agent for full agentic processing:
#   entity extraction, corrections, Vector upsert, structured conclusions.
#   Runs as a fire-and-forget background process.
#
# This dual approach ensures:
# - Something is ALWAYS saved (Path 1, even if claude -p fails)
# - Full agentic memory processing happens asynchronously (Path 2)
#
# Receives JSON on stdin with:
#   - session_id: session identifier
#   - transcript_path: path to conversation JSONL file
#   - cwd: working directory
#   - reason: why session ended
#
# Claude Code JSONL format notes:
#   - Each line is a JSON object with top-level .type field
#   - Types: "user", "assistant", "progress", "file-history-snapshot"
#   - Text content: .message.content[] where item .type == "text" and text in .text
#   - "progress" entries (subagent updates) can be very large (100KB+)
#   - Filter by line size (< 5KB) before jq processing to avoid OOM/hangs

set -uo pipefail

INPUT=$(cat)

if ! command -v agentuity &>/dev/null; then
  exit 0
fi

# Derive plugin root from this script's location
# Script is at: <plugin_root>/hooks/scripts/session-end.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Extract fields from input JSON
if command -v jq &>/dev/null; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
  TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
  REASON=$(echo "$INPUT" | jq -r '.reason // empty' 2>/dev/null)
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
else
  SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  TRANSCRIPT_PATH=$(echo "$INPUT" | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  REASON=$(echo "$INPUT" | grep -o '"reason"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  CWD=$(echo "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
fi

if [ -z "$SESSION_ID" ] || [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ─────────────────────────────────────────────────────
# Extract conversation content from JSONL transcript
# ─────────────────────────────────────────────────────
# Key: filter lines < 5KB to skip huge "progress" entries that crash jq.
# Only extract .message.content[] items with .type == "text"

CONVERSATION=""
if command -v jq &>/dev/null && command -v awk &>/dev/null; then
  CONVERSATION=$(awk 'length < 5000' "$TRANSCRIPT_PATH" 2>/dev/null | jq -r '
    if .type == "assistant" then
      .message.content[]? | select(.type == "text") | "ASSISTANT: " + (.text // "")
    elif .type == "user" then
      .message.content[]? | select(.type == "text") | "USER: " + (.text // "")
    else empty end
  ' 2>/dev/null | tail -40 | head -c 8000)
fi

# Fallback: raw tail
if [ -z "$CONVERSATION" ]; then
  CONVERSATION=$(tail -20 "$TRANSCRIPT_PATH" 2>/dev/null | head -c 4000)
fi

# ─────────────────────────────────────────────────────
# PATH 1: Immediate structured KV save
# ─────────────────────────────────────────────────────

SESSION_RECORD=$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg branch "$GIT_BRANCH" \
  --arg remote "$GIT_REMOTE" \
  --arg reason "$REASON" \
  --arg ts "$TIMESTAMP" \
  --arg cwd "$CWD" \
  --arg convo "$CONVERSATION" \
  '{
    sessionId: $sid,
    branch: $branch,
    remote: $remote,
    endReason: $reason,
    timestamp: $ts,
    source: "claude-code",
    cwd: $cwd,
    conversation: $convo
  }' 2>/dev/null)

if [ -n "$SESSION_RECORD" ]; then
  agentuity cloud kv set agentuity-opencode-memory "session:cc:${SESSION_ID}" "$SESSION_RECORD" --region use 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────
# PATH 2: Async agentic processing via background claude -p
# ─────────────────────────────────────────────────────
# Spawns a background claude -p with the plugin loaded, delegating to the
# Memory agent for full agentic processing (entity extraction, corrections,
# Vector upsert, structured conclusions).
#
# Key learnings from iteration:
#   - --allowedTools must be SEPARATE arguments, not comma-separated
#   - Pattern syntax is Bash(agentuity *) not Bash(pattern agentuity*)
#   - Memory agent (via Task tool) handles all KV/Vector storage
#   - --plugin-dir loads the plugin so Task can access the Memory agent
#
# This is "Option A" — local/sandbox use. For production at scale,
# replace with queue-based worker (Option B) or control plane (Option C).

if command -v claude &>/dev/null; then
  # Write session context to temp file for claude -p to read
  MEMORY_FILE=$(mktemp /tmp/agentuity-session-XXXXXX.md)

  cat > "$MEMORY_FILE" <<MEMORY_CONTEXT
# Session Memorialization Request

**Session ID:** ${SESSION_ID}
**Branch:** ${GIT_BRANCH}
**Repository:** ${GIT_REMOTE}
**Working Directory:** ${CWD}
**End Reason:** ${REASON}
**Timestamp:** ${TIMESTAMP}

## Conversation Transcript

${CONVERSATION}
MEMORY_CONTEXT

  LOG_DIR="/tmp/agentuity-memory-logs"
  mkdir -p "$LOG_DIR" 2>/dev/null

  # Spawn background claude -p with plugin loaded.
  # Delegates to Memory agent via Task tool for full agentic processing.
  # --dangerously-skip-permissions: background process, no user to prompt.
  # --tools: restricts available tools to Task, Read, Bash (scoped).
  nohup claude -p "Read the file ${MEMORY_FILE} which contains a session transcript to memorialize.

Use the Task tool to delegate to the Memory agent:
- subagent_type: agentuity-coder:agentuity-coder-memory
- description: Memorialize session ${SESSION_ID}
- prompt: Memorialize this session. You are being invoked automatically at session end. Read the file ${MEMORY_FILE} for the full session context. Then perform a full session memorialization: create a session summary (PROBLEM, CONTEXT, DECISIONS, CORRECTIONS, SOLUTIONS, PATTERNS, FILES, OPEN QUESTIONS), extract and store corrections to KV, store decisions to KV, upsert the full session document to Vector for semantic search, and apply reasoning to extract conclusions. Session ID: ${SESSION_ID}, Branch: ${GIT_BRANCH}, Repo: ${GIT_REMOTE}. Do NOT ask questions. Prioritize corrections and decisions.

After the Memory agent completes, clean up by running: rm ${MEMORY_FILE}" \
    --plugin-dir "$PLUGIN_ROOT" \
    --dangerously-skip-permissions \
    --tools "Task,Read,Bash" \
    > "$LOG_DIR/session-${SESSION_ID}.log" 2>&1 &

  # Don't wait for completion — fire and forget
fi

# ─────────────────────────────────────────────────────
# (Future) PATH 3: Queue publish for worker-based processing
# ─────────────────────────────────────────────────────
# Uncomment when a queue worker (Option B/C) is available.
# The queue provides durability, retry, and DLQ for production use.
#
# QUEUE_PAYLOAD=$(jq -n \
#   --arg type "session-memorialize" \
#   --arg sid "$SESSION_ID" \
#   --arg branch "$GIT_BRANCH" \
#   --arg remote "$GIT_REMOTE" \
#   --arg cwd "$CWD" \
#   --arg reason "$REASON" \
#   --arg ts "$TIMESTAMP" \
#   --arg convo "$CONVERSATION" \
#   '{
#     type: $type,
#     sessionId: $sid,
#     branch: $branch,
#     remote: $remote,
#     cwd: $cwd,
#     endReason: $reason,
#     timestamp: $ts,
#     transcript: $convo
#   }' 2>/dev/null)
#
# if [ -n "$QUEUE_PAYLOAD" ]; then
#   agentuity cloud queue publish coder-memory-processing "$QUEUE_PAYLOAD" \
#     --metadata "{\"sessionId\":\"$SESSION_ID\",\"branch\":\"$GIT_BRANCH\",\"type\":\"session-memorialize\"}" \
#     --idempotency-key "session:$SESSION_ID" \
#     2>/dev/null || true
# fi

exit 0
