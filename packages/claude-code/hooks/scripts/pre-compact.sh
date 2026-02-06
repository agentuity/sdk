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
  "additionalContext": "[COMPACTION IMMINENT] Before this context is compacted, ensure session progress is preserved. Use the Memory agent (agentuity-coder:agentuity-coder-memory) to save:\n1. Key decisions made in this session\n2. Any corrections or lessons learned\n3. Patterns discovered\n4. Current task state and progress\n\nSave to KV namespace 'agentuity-opencode-memory' with appropriate keys (session:{sessionId}, correction:{name}, decision:{name}, pattern:{name}). Include branch: ${GIT_BRANCH}. Also upsert a session summary to Vector for semantic search.\n\nThis is critical — compaction will erase conversation history. Save context NOW before proceeding."
}
EOF
