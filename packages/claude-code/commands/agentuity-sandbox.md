---
name: agentuity-sandbox
description: Agentuity sandboxes — isolated execution environments for running code, tests, and builds
---

Help with Agentuity sandboxes using the `agentuity cloud sandbox` CLI.

## Common Commands

```
agentuity cloud sandbox runtime list --json                            # List available runtimes
agentuity cloud sandbox run [--memory 1Gi] [--cpu 1000m] \
  [--runtime <name>] [--name <name>] -- <command>                      # One-shot execution
agentuity cloud sandbox create --json [--memory 1Gi] [--cpu 1000m] \
  [--network] [--runtime <name>] [--name <name>]                       # Create persistent sandbox
agentuity cloud sandbox list --json                                    # List sandboxes
agentuity cloud sandbox exec <id> -- <command>                         # Run in existing sandbox
agentuity cloud sandbox files <id> [path] --json                       # List files
agentuity cloud sandbox cp ./local <id>:/home/agentuity                # Copy files to sandbox
agentuity cloud sandbox delete <id> --json                             # Delete sandbox
agentuity cloud sandbox snapshot create <id> \
  [--name <name>] [--tag <tag>]                                        # Save sandbox state
```

## Guidelines

1. First check auth: `agentuity auth whoami`
2. Use `--json` for programmatic output
3. Default working directory inside sandboxes: `/home/agentuity`
4. Use `runtime list` to find runtimes, then pass `--runtime` on `run`/`create`
5. Use `--name` and `--description` for better tracking

Execute the user's sandbox request using the Bash tool with `agentuity cloud sandbox` commands.
