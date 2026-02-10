#!/usr/bin/env bash
# Setup script for Cadence mode.
# Creates the .claude/agentuity-cadence.local.md state file and saves initial state to KV.
#
# Usage: setup-cadence.sh [--max-iterations N] [--completion-promise TEXT] PROMPT
#
# The state file is read by cadence-stop.sh (Stop hook) to keep
# the loop running until the completion promise is detected.
# State is also persisted to Agentuity Cloud KV for cross-session recall.

set -euo pipefail

MAX_ITERATIONS=50
COMPLETION_PROMISE="DONE"
PROMPT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --completion-promise)
      COMPLETION_PROMISE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: setup-cadence.sh [OPTIONS] PROMPT"
      echo ""
      echo "Options:"
      echo "  --max-iterations N        Maximum loop iterations (default: 50)"
      echo "  --completion-promise TEXT  Completion signal text (default: DONE)"
      echo "  -h, --help                Show this help"
      exit 0
      ;;
    *)
      # Everything else is the prompt
      if [ -z "$PROMPT" ]; then
        PROMPT="$1"
      else
        PROMPT="$PROMPT $1"
      fi
      shift
      ;;
  esac
done

if [ -z "$PROMPT" ]; then
  echo "Error: No prompt provided" >&2
  echo "Usage: setup-cadence.sh [OPTIONS] PROMPT" >&2
  exit 1
fi

# Validate max-iterations
if ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]] || [[ "$MAX_ITERATIONS" -lt 1 ]]; then
  echo "Error: --max-iterations must be a positive integer" >&2
  exit 1
fi

# Generate a loop ID: lp_{short_name}_{random}
# Take first 3 words of prompt, lowercase, underscored, plus random suffix
SHORT_NAME=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '_' | cut -c1-30 | sed 's/_$//')
RANDOM_SUFFIX=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-6)
LOOP_ID="lp_${SHORT_NAME}_${RANDOM_SUFFIX}"

# Get git branch
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# Create .claude directory if needed
mkdir -p .claude

# Check for existing cadence session
if [ -f ".claude/agentuity-cadence.local.md" ]; then
  EXISTING_ITER=$(sed -n '/^---$/,/^---$/{ /^iteration:/s/iteration: *//p }' .claude/agentuity-cadence.local.md)
  EXISTING_LOOP=$(sed -n '/^---$/,/^---$/{ /^loop_id:/s/loop_id: *//p }' .claude/agentuity-cadence.local.md | tr -d '"')
  echo "Warning: Active Cadence loop found (${EXISTING_LOOP:-?} at iteration ${EXISTING_ITER:-?}). Replacing with new loop." >&2
  rm -f .claude/agentuity-cadence.local.md
fi

# Create state file
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > .claude/agentuity-cadence.local.md << STATEFILE
---
active: true
loop_id: "${LOOP_ID}"
iteration: 1
max_iterations: ${MAX_ITERATIONS}
completion_promise: "${COMPLETION_PROMISE}"
branch: "${GIT_BRANCH}"
created_at: ${CREATED_AT}
---

${PROMPT}
STATEFILE

# Save initial cadence state to KV (if agentuity CLI available)
if command -v agentuity &>/dev/null; then
  KV_STATE=$(jq -n \
    --arg loopId "$LOOP_ID" \
    --arg prompt "$PROMPT" \
    --arg branch "$GIT_BRANCH" \
    --arg createdAt "$CREATED_AT" \
    --argjson iteration 1 \
    --argjson maxIterations "$MAX_ITERATIONS" \
    --arg completionPromise "$COMPLETION_PROMISE" \
    --arg status "active" \
    '{
      loopId: $loopId,
      prompt: $prompt,
      branch: $branch,
      iteration: $iteration,
      maxIterations: $maxIterations,
      completionPromise: $completionPromise,
      status: $status,
      startedAt: $createdAt,
      lastActivity: $createdAt,
      checkpoints: []
    }')
  agentuity cloud kv set agentuity-opencode-memory "cadence:${LOOP_ID}" "$KV_STATE" --region use 2>/dev/null || true
fi

echo "Cadence loop initialized:"
echo "  Loop ID: ${LOOP_ID}"
echo "  Max iterations: ${MAX_ITERATIONS}"
echo "  Completion promise: ${COMPLETION_PROMISE}"
echo "  Branch: ${GIT_BRANCH}"
echo "  State file: .claude/agentuity-cadence.local.md"
echo "  KV key: cadence:${LOOP_ID}"
echo ""
echo "The loop will continue until you output <promise>${COMPLETION_PROMISE}</promise>"
echo "or reach ${MAX_ITERATIONS} iterations."
echo "To cancel: /agentuity-cadence-cancel"
