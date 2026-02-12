#!/usr/bin/env bash
# PreToolUse hook: Block sensitive agentuity commands (secrets, apikeys, tokens).
#
# NOTE: CLI plugin hooks can only BLOCK commands (exit 2 = block).
# Auto-allowing is handled via permissions.allow in settings.local.json,
# which is configured by the install script (src/install.ts).
#
# Exit 0 = don't interfere (let normal permission rules handle it).
# Exit 2 + JSON to stderr = block the command.

INPUT=$(cat)

# Use jq if available, fall back to grep
if command -v jq &>/dev/null; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
else
  COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
fi

# If we can't extract the command, don't interfere
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block sensitive commands
case "$COMMAND" in
  *"agentuity cloud secret"*|*"agentuity cloud secrets"*)
    echo '{"decision":"block","reason":"Blocked: agentuity cloud secrets access is not allowed by the Agentuity Coder plugin"}' >&2
    exit 2
    ;;
  *"agentuity cloud apikey"*)
    echo '{"decision":"block","reason":"Blocked: agentuity cloud apikey access is not allowed by the Agentuity Coder plugin"}' >&2
    exit 2
    ;;
  *"agentuity auth token"*)
    echo '{"decision":"block","reason":"Blocked: agentuity auth token access is not allowed by the Agentuity Coder plugin"}' >&2
    exit 2
    ;;
esac

# For anything else, don't interfere — permission rules in settings.local.json
# handle auto-allowing agentuity cloud commands.
exit 0
