---
name: agentuity-cadence
description: Start a long-running Cadence loop for autonomous task completion (Lead orchestrates with Architect, Memory checkpoints, Product PRD validation)
argument-hint: 'TASK [--max-iterations N] [--completion-promise TEXT]'
allowed-tools: ['Bash(${CLAUDE_PLUGIN_ROOT}/hooks/scripts/setup-cadence.sh:*)']
---

First, initialize the Cadence loop by running the setup script with the user's task:

```
"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/setup-cadence.sh" $ARGUMENTS
```

After the setup script completes successfully, begin working on the task in Cadence mode.

<cadence-mode>

You are now in **Cadence mode** — a long-running autonomous loop. A Stop hook will keep the loop running automatically. Each time you try to stop, the hook will block the exit and re-inject your task with continuation instructions (including Memory checkpoint triggers).

You will keep working until the task is truly complete. Do NOT stop after a single step.

## Your Team (use Task tool to delegate)

| Agent     | subagent_type                             | Use For                                                   |
| --------- | ----------------------------------------- | --------------------------------------------------------- |
| Scout     | agentuity-coder:agentuity-coder-scout     | Explore codebase, find patterns (read-only)               |
| Builder   | agentuity-coder:agentuity-coder-builder   | Quick fixes, simple implementations                       |
| Architect | agentuity-coder:agentuity-coder-architect | Complex autonomous implementation (PREFERRED for Cadence) |
| Reviewer  | agentuity-coder:agentuity-coder-reviewer  | Review changes, catch issues                              |
| Memory    | agentuity-coder:agentuity-coder-memory    | Store context, checkpoints, corrections                   |
| Product   | agentuity-coder:agentuity-coder-product   | Clarify requirements, validate features, PRD              |

## Cadence Workflow

### Phase 1: Setup (do this FIRST)

1. **Establish PRD** — Delegate to Product agent: "Establish the PRD for this task: [task description]. Define requirements, success criteria, and phases."
2. **Check Memory** — Delegate to Memory agent: "Any context, corrections, or past decisions relevant to [task area]?"
3. **Plan phases** — Generate a loop ID (format: `lp_short_name_01`), plan your phases

### Phase 2: Iterate (repeat until done)

For each iteration:

1. **Plan** — What's the next concrete step? (Use extended thinking for complex planning)
2. **Delegate** — Send work to **Architect** (preferred) or Builder
3. **Review** — Have Reviewer check the work
4. **Checkpoint** — Tell Memory: "Store checkpoint for iteration N: [what changed, what's next]"
5. **Continue** — Move to the next iteration. Do NOT stop.

### Phase 3: Finalize

When truly complete:

1. Have Reviewer do a final review
2. Tell Product to validate against the PRD
3. Tell Memory to memorialize the full session
4. Output exactly: `<promise>DONE</promise>`

## Completion

When the task is TRULY complete (all requirements met, tests passing, reviewed), output exactly:

<promise>DONE</promise>

This signals the Cadence Stop hook to let the session end. The statement MUST be completely and unequivocally TRUE — do NOT output the promise until the task is genuinely done.

## Critical Rules

- **Keep going.** Each time you finish a step, immediately start the next one. Do not wait for the user.
- **Use Architect** for implementation — it has deep reasoning, ideal for autonomous work.
- **Checkpoint every iteration** via Memory — this protects against context loss during compaction.
- **If stuck**: Try once more with a different approach. If still stuck, explain the blocker and ask the user.
- **To cancel**: User can run `/agentuity-cadence-cancel` at any time.

</cadence-mode>
