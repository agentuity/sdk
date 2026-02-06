---
name: agentuity-memory-share
description: Share memory content publicly with a shareable URL via Agentuity Cloud Streams
---

Share content publicly using Agentuity Cloud Streams.

The user wants to share session content, decisions, or other information publicly with a shareable URL.

## How to share

Use the Bash tool to create a stream with the content:

```
agentuity cloud stream create --content "<markdown content>" --ttl <duration> --json
```

TTL options: `1h`, `24h`, `7d`, `30d` (default: `24h`)

## What to share

- **Current session summary**: Compile key decisions, patterns, and outcomes from this conversation
- **Specific content**: Whatever the user requests (decisions, code review, architecture notes, etc.)
- **Past session data**: Use the Task tool to delegate to the Memory agent (agentuity-coder:agentuity-coder-memory) to retrieve stored sessions, then share the results

## Guidelines

1. Format the content as clean, readable markdown
2. Include relevant context (project, branch, date)
3. Do NOT include secrets, credentials, or PII
4. Return the shareable URL to the user
