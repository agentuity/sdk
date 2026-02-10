---
name: agentuity-memory-save
description: Save the current session context to Agentuity Cloud memory (KV + Vector storage) for future recall
---

Invoke the Agentuity Coder Memory agent to memorialize this session. Use the Task tool with agent type "agentuity-coder:agentuity-coder-memory".

Tell Memory to:
1. Summarize what was accomplished in this session
2. Extract key decisions, patterns, and corrections
3. Store in KV and Vector storage for future recall
4. Note any open questions or follow-ups

The Memory agent will use Agentuity Cloud KV and Vector storage to persist this session's context.
