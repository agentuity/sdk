#!/usr/bin/env bash
# Cadence Stop Hook: Keeps the Cadence loop running until completion.
#
# Checks for active Cadence state file (.claude/agentuity-cadence.local.md).
# If active:
#   - Reads the last assistant message from the transcript
#   - Checks for <promise>DONE</promise> completion signal
#   - Checks max iterations
#   - If continuing: saves state to KV, blocks stop, re-injects prompt
#   - If done: saves final state to KV, allows stop
# If not active: allows stop normally (exit 0)
#
# State is persisted to Agentuity Cloud KV at each iteration for cross-session
# recall and crash recovery. Local file is the control mechanism; KV is durable storage.
#
# Exit 0 = allow stop (no active cadence, or task complete)
# Exit 2 + JSON with decision:block = prevent stop and re-inject prompt

INPUT=$(cat)

# State file location (following Ralph Wiggum convention)
STATE_FILE=".claude/agentuity-cadence.local.md"

# If no active Cadence session, allow normal stop
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Parse YAML frontmatter from state file
LOOP_ID=$(sed -n '/^---$/,/^---$/{ /^loop_id:/s/loop_id: *//p }' "$STATE_FILE" | tr -d '"')
ITERATION=$(sed -n '/^---$/,/^---$/{ /^iteration:/s/iteration: *//p }' "$STATE_FILE")
MAX_ITERATIONS=$(sed -n '/^---$/,/^---$/{ /^max_iterations:/s/max_iterations: *//p }' "$STATE_FILE")
COMPLETION_PROMISE=$(sed -n '/^---$/,/^---$/{ /^completion_promise:/s/completion_promise: *//p }' "$STATE_FILE" | tr -d '"')
CREATED_AT=$(sed -n '/^---$/,/^---$/{ /^created_at:/s/created_at: *//p }' "$STATE_FILE")

# Defaults
LOOP_ID=${LOOP_ID:-unknown}
ITERATION=${ITERATION:-1}
MAX_ITERATIONS=${MAX_ITERATIONS:-50}
COMPLETION_PROMISE=${COMPLETION_PROMISE:-DONE}
CREATED_AT=${CREATED_AT:-unknown}

# Validate iteration is numeric
if ! [[ "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "Cadence error: Invalid iteration '$ITERATION'. Removing state file." >&2
  rm -f "$STATE_FILE"
  exit 0
fi

if ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "Cadence error: Invalid max_iterations '$MAX_ITERATIONS'. Removing state file." >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# Get git branch for context
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Helper: save cadence state to KV
save_to_kv() {
  local status="$1"
  if command -v agentuity &>/dev/null && [ "$LOOP_ID" != "unknown" ]; then
    KV_STATE=$(jq -n \
      --arg loopId "$LOOP_ID" \
      --arg branch "$GIT_BRANCH" \
      --arg createdAt "$CREATED_AT" \
      --arg lastActivity "$NOW" \
      --argjson iteration "$ITERATION" \
      --argjson maxIterations "$MAX_ITERATIONS" \
      --arg completionPromise "$COMPLETION_PROMISE" \
      --arg status "$status" \
      '{
        loopId: $loopId,
        branch: $branch,
        iteration: $iteration,
        maxIterations: $maxIterations,
        completionPromise: $completionPromise,
        status: $status,
        startedAt: $createdAt,
        lastActivity: $lastActivity
      }')
    agentuity cloud kv set agentuity-opencode-memory "cadence:${LOOP_ID}" "$KV_STATE" --region use 2>/dev/null || true
  fi
}

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "Cadence: Max iterations ($MAX_ITERATIONS) reached. Loop complete." >&2
  save_to_kv "completed_max_iterations"
  rm -f "$STATE_FILE"
  exit 0
fi

# Get transcript path from hook input
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)

# Check for completion promise in transcript
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Get the last assistant message
  LAST_ASSISTANT=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1 2>/dev/null)

  if [ -n "$LAST_ASSISTANT" ]; then
    LAST_TEXT=$(echo "$LAST_ASSISTANT" | jq -r '
      .message.content |
      map(select(.type == "text")) |
      map(.text) |
      join("\n")
    ' 2>/dev/null)

    # Check for completion promise using perl (handles multiline)
    if [ -n "$LAST_TEXT" ]; then
      PROMISE_TEXT=$(echo "$LAST_TEXT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/\1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null)

      if [ -n "$PROMISE_TEXT" ] && [ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]; then
        echo "Cadence: Completion detected (<promise>$COMPLETION_PROMISE</promise>). Loop finished." >&2
        save_to_kv "completed"
        rm -f "$STATE_FILE"
        exit 0
      fi
    fi
  fi
fi

# Extract the original prompt (everything after the second --- delimiter)
PROMPT_TEXT=$(awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "$STATE_FILE")

if [ -z "$PROMPT_TEXT" ]; then
  echo "Cadence error: No prompt found in state file. Removing." >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# Increment iteration
NEXT_ITERATION=$((ITERATION + 1))

# Update state file atomically
sed "s/^iteration: *[0-9]*/iteration: $NEXT_ITERATION/" "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

# Save iteration state to KV
ITERATION=$NEXT_ITERATION
save_to_kv "active"

# Build system message
SYSTEM_MSG="Cadence iteration ${NEXT_ITERATION}/${MAX_ITERATIONS} | Loop: ${LOOP_ID} | Branch: ${GIT_BRANCH} | To complete: output <promise>${COMPLETION_PROMISE}</promise>"

# Build continuation prompt with Memory checkpoint trigger
read -r -d '' CONTINUATION << CONT_EOF || true
[CADENCE CONTINUATION - Iteration ${NEXT_ITERATION}/${MAX_ITERATIONS}]

You are in Cadence mode. Loop ID: ${LOOP_ID}. This is iteration ${NEXT_ITERATION} of ${MAX_ITERATIONS}.

BEFORE continuing work, checkpoint with Memory:
- Use the Task tool: subagent_type=agentuity-coder:agentuity-coder-memory
- Prompt: "Checkpoint iteration ${ITERATION} for loop ${LOOP_ID}: Store what was accomplished and what's next. Update the cadence record in KV (key: cadence:${LOOP_ID}, namespace: agentuity-opencode-memory). Read the existing record, append this checkpoint to the checkpoints array, and save back. Branch: ${GIT_BRANCH}"

Then continue working on the task below. Pick up where you left off — do NOT restart from the beginning.

When the task is TRULY complete (all requirements met, tests passing, reviewed):
1. Have Reviewer do a final review
2. Have Product validate against the PRD
3. Tell Memory to memorialize the full session (save to KV and Vector)
4. Output: <promise>${COMPLETION_PROMISE}</promise>

## Original Task

${PROMPT_TEXT}
CONT_EOF

# Output JSON to block stop and re-inject the prompt
jq -n \
  --arg reason "$CONTINUATION" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $reason,
    "systemMessage": $msg
  }'

exit 2
