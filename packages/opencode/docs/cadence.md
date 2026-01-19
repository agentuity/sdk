# Agentuity Cadence

> Long-running autonomous agent sessions for the Agentuity Coder team.

**Thread Reference:** [T-019bd30c-0b43-753d-bbb4-70178102aeac](https://ampcode.com/threads/T-019bd30c-0b43-753d-bbb4-70178102aeac)

## Overview

Cadence enables the Agentuity Coder team to work autonomously on complex tasks across multiple iterations until completion. It's designed to:

- Continue work across session boundaries
- Manage long-running tasks that exceed single-session context limits
- Support headless execution in sandboxes
- Enable future multi-team orchestration

## Philosophy: Agentic-First

Cadence is **prompt-based, not code-based**. The agents (especially Lead) are given instructions on how to manage long-running work. There is minimal deterministic code — just enough to:

1. Trigger Cadence mode via commands
2. Persist loop state to KV for durability
3. Detect session idle and prompt Lead to continue
4. Provide CLI control for headless scenarios

The actual orchestration logic lives in **Lead's system prompt** when in Cadence mode.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agentuity Cadence                        │
├─────────────────────────────────────────────────────────────┤
│  TUI Commands                                               │
│  └── /agentuity-cadence start <freeform task>              │
│      Routes to Lead with Cadence mode enabled               │
├─────────────────────────────────────────────────────────────┤
│  CLI Commands (headless control)                            │
│  └── agentuity cadence list|status|pause|resume|stop        │
│      Updates KV state, agents respect it                    │
├─────────────────────────────────────────────────────────────┤
│  Plugin Hooks                                               │
│  └── session.idle → Check if Cadence active → Prompt Lead   │
├─────────────────────────────────────────────────────────────┤
│  KV State (agentuity-opencode-tasks)                        │
│  ├── loop:{loopId}:state      Current loop status           │
│  ├── loop:{loopId}:checkpoint:{n}  Iteration summaries      │
│  └── loop:{loopId}:handoff    Context packet for recovery   │
├─────────────────────────────────────────────────────────────┤
│  Queue (agentuity-cadence-work) — Future/Multi-Team         │
│  └── Lead uses queue CLI when orchestrating multiple teams  │
│      (Not a code-based queue manager)                       │
└─────────────────────────────────────────────────────────────┘
```

## Loop State

Stored in KV at `loop:{loopId}:state`:

```typescript
interface CadenceLoop {
	loopId: string; // lp_xxxxx
	parentId?: string; // For orchestrator hierarchy (multi-team)
	projectLabel?: string; // Flexible context identifier
	sessionId?: string; // Current opencode session
	status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
	iteration: number;
	maxIterations: number; // Default 50, Lead can adjust
	prompt: string; // Original task (freeform)
	createdAt: string;
	updatedAt: string;
	lastError?: string;
	sandbox?: {
		mode: 'off' | 'per_iteration' | 'persistent';
		sandboxId?: string;
	};
}
```

## TUI Commands

All commands are freeform — Lead interprets intent:

| Command | Example                                                                 |
| ------- | ----------------------------------------------------------------------- |
| Start   | `/agentuity-cadence start build the auth feature, run tests in sandbox` |
| Status  | `/agentuity-cadence status`                                             |
| Pause   | `/agentuity-cadence pause`                                              |
| Resume  | `/agentuity-cadence resume`                                             |
| Stop    | `/agentuity-cadence stop`                                               |

## CLI Commands

For controlling headless/sandboxed runs:

```bash
agentuity cadence list [--project <label>]     # Active loops
agentuity cadence status <loopId>              # Loop details
agentuity cadence pause <loopId>               # Pause loop
agentuity cadence resume <loopId>              # Resume loop
agentuity cadence stop <loopId>                # Cancel loop
```

These update KV state. Lead checks state at each iteration boundary and respects pause/stop.

## Completion Signal

Lead outputs `<promise>DONE</promise>` when the task is truly complete. The session.idle hook detects this and finalizes the loop.

## Iteration Flow

1. **Session becomes idle** → Hook checks for active Cadence loop
2. **Check for completion** → Scan output for `<promise>DONE</promise>`
3. **If complete** → Update KV status to `completed`, invoke Memory to memorialize
4. **If not complete** → Inject continuation prompt to Lead
5. **Lead continues** → Asks Memory for context, delegates to team, works on next step
6. **Iteration ends** → Lead stores checkpoint with Memory, loop repeats

## Memory Integration

- **Iteration start**: Lead asks Memory for relevant context (not full history replay)
- **Iteration end**: Lead tells Memory to store checkpoint (what changed, what's next)
- **Context pressure**: Memory creates "handoff packet" — condensed summary for fresh context
- **Loop complete**: Memory memorializes the full session

## Recovery Flow

```
Iteration fails or stuck
    ↓
[Lead recognizes problem]
    ↓
[Recovery attempt]
"Ask Scout to re-evaluate constraints, try different approach"
    ↓
Still stuck after recovery?
    ↓
[Surface to user]
Lead pauses loop, stores "needs human input" checkpoint
```

## Multi-Team Orchestration (Future)

When Lead needs to manage multiple Agentuity teams:

1. Lead uses `agentuity ai opencode run` to spawn child sessions
2. Each child is its own Cadence loop with `parentId` referencing the orchestrator
3. Lead uses queue CLI (`agentuity cloud queue`) to coordinate work across teams
4. Memory provides shared context across all teams

This is **agent-driven** — Lead's prompt tells it how to orchestrate, not bespoke code.

## Default Configuration

- **Max iterations**: 50 (Lead can adjust based on task complexity)
- **Completion tag**: `<promise>DONE</promise>`
- **Recovery attempts**: 1 recovery prompt before surfacing to user

## Implementation Phases

### Phase 1: Core (MVP) ✅

- [x] Add Cadence mode to Lead's system prompt
- [x] Add TUI commands (`/agentuity-cadence start|status|pause|resume|stop`)
- [x] Add session.idle hook for continuation (cadence.ts)
- [x] Add CadenceLoop type for KV state

### Phase 2: CLI Control ✅

- [x] Add `agentuity cadence` CLI commands (list, status, pause, resume, stop)
- [x] Wire CLI to update KV state

### Phase 3: Memory Handoff ✅

- [x] Update Memory prompt for checkpoint storage
- [x] Add handoff packet pattern for context pressure

### Phase 4: Multi-Team ✅ (Prompt-based)

- [x] Add orchestrator instructions to Lead prompt (via `agentuity ai opencode run`)
- [x] Document queue usage pattern for team coordination

## Files Changed

| File                            | Purpose                         |
| ------------------------------- | ------------------------------- |
| `src/agents/lead.ts`            | Add Cadence mode instructions   |
| `src/agents/memory.ts`          | Add checkpoint/handoff patterns |
| `src/plugin/plugin.ts`          | Add Cadence TUI commands        |
| `src/plugin/hooks/cadence.ts`   | Session.idle hook, KV helpers   |
| `src/types.ts`                  | CadenceLoop type                |
| `packages/cli/src/cmd/cadence/` | CLI commands (Phase 2)          |

## Usage Examples

### Start a long-running task

```
/agentuity-cadence start implement the new payment integration, including tests and documentation
```

### Check status

```
/agentuity-cadence status
```

### Pause for later

```
/agentuity-cadence pause
```

### Resume (possibly in new session)

```
/agentuity-cadence resume
```

### Headless (sandbox)

```bash
# Start in background
agentuity ai opencode run "/agentuity-cadence start build the feature"

# Check on it
agentuity cadence list
agentuity cadence status lp_abc123

# Stop if needed
agentuity cadence stop lp_abc123
```
