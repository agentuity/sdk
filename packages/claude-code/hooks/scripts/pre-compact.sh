#!/usr/bin/env bash
# PreCompact hook: Inject memory-save instructions before context compaction.
#
# When Claude Code compacts context (auto or manual), this hook adds
# additionalContext instructing the LLM to save important session context
# via the Memory agent before the compaction erases it.
#
# Output: JSON with additionalContext field to stdout.

INPUT=$(cat)

# Check if agentuity CLI is available
if ! command -v agentuity &>/dev/null; then
  exit 0
fi

# Get current git branch for context
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

cat <<EOF
{
  "additionalContext": "[COMPACTION IMMINENT — SAVE CONTEXT NOW]\n\nContext is about to be compacted. You MUST delegate to the Memory agent BEFORE compaction erases conversation history.\n\nUse the Task tool with these parameters:\n- subagent_type: agentuity-coder:agentuity-coder-memory\n- description: Save pre-compaction memory\n- prompt: \"COMPACTION IMMINENT. You are being invoked automatically before context compaction. Review the conversation above and perform these steps:\\n\\n1. Create/update session record in KV (session:{sessionId}) with: title, summary, decisions[], corrections[], files[], and append to compactions[] array\\n2. Extract corrections/mistakes as separate KV entries (correction:{name}) — these are HIGH PRIORITY\\n3. Extract key decisions as KV entries (decision:{name})\\n4. Upsert FULL session document to Vector (agentuity-opencode-sessions) as readable markdown — NOT a summary, the FULL content\\n5. Apply reasoning: extract explicit, deductive, inductive, abductive conclusions and update entity representations\\n6. Branch: ${GIT_BRANCH}\\n\\nDo NOT ask questions. Extract and store everything you can. This conversation will be compacted after you finish.\"\n\nThis is CRITICAL — do this immediately before any other work."
}
EOF
