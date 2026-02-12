---
name: agentuity-cadence-cancel
description: Cancel an active Cadence loop
allowed-tools:
   [
      'Bash(test -f .claude/agentuity-cadence.local.md:*)',
      'Bash(rm .claude/agentuity-cadence.local.md)',
      'Read(.claude/agentuity-cadence.local.md)',
   ]
---

Check if there's an active Cadence loop and cancel it:

1. Check if `.claude/agentuity-cadence.local.md` exists: `test -f .claude/agentuity-cadence.local.md && echo "EXISTS" || echo "NOT_FOUND"`
2. If NOT_FOUND: Tell the user "No active Cadence loop found."
3. If EXISTS:
   - Read the file to get the current iteration from the frontmatter
   - Delete it: `rm .claude/agentuity-cadence.local.md`
   - Tell the user: "Cancelled Cadence loop (was at iteration N)"
   - Offer to save session memory via the Memory agent
