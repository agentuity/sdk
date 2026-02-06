#!/usr/bin/env bash
# Session end hook: Save session context via TWO paths:
#
# PATH 1 (Immediate): Structured KV save — session metadata + conversation extract.
#   Fast, reliable, always works. Extracts actual text content from transcript.
#
# PATH 2 (Async/Agentic): Publish to 'coder-memory-processing' queue.
#   A worker (claude -p or Agentuity agent) consumes the message and runs
#   the full Memory agent reasoning pipeline: entity extraction, corrections,
#   Vector upsert with full markdown, structured conclusions.
#
# This dual approach ensures:
# - Something is ALWAYS saved (Path 1, even if queue is down)
# - Full agentic processing happens asynchronously (Path 2)
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
# PATH 2: Async agentic processing via queue
# ─────────────────────────────────────────────────────
# Publish session data to 'coder-memory-processing' queue.
# A worker runs the full Memory agent pipeline:
#   - Session memorialization (structured summary template)
#   - Correction/decision/pattern extraction
#   - Vector upsert (full markdown document)
#   - Entity representation updates
#   - Reasoning (explicit, deductive, inductive, abductive conclusions)

QUEUE_PAYLOAD=$(jq -n \
  --arg type "session-memorialize" \
  --arg sid "$SESSION_ID" \
  --arg branch "$GIT_BRANCH" \
  --arg remote "$GIT_REMOTE" \
  --arg cwd "$CWD" \
  --arg reason "$REASON" \
  --arg ts "$TIMESTAMP" \
  --arg convo "$CONVERSATION" \
  '{
    type: $type,
    sessionId: $sid,
    branch: $branch,
    remote: $remote,
    cwd: $cwd,
    endReason: $reason,
    timestamp: $ts,
    transcript: $convo
  }' 2>/dev/null)

if [ -n "$QUEUE_PAYLOAD" ]; then
  agentuity cloud queue publish coder-memory-processing "$QUEUE_PAYLOAD" \
    --metadata "{\"sessionId\":\"$SESSION_ID\",\"branch\":\"$GIT_BRANCH\",\"type\":\"session-memorialize\"}" \
    --idempotency-key "session:$SESSION_ID" \
    2>/dev/null || true
fi

exit 0
