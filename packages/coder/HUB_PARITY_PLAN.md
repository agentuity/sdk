# Coder Hub TUI Parity Plan

Scope: `packages/coder` parity with recent Hub changes in `/agentuity/coder`, excluding saved-skill library and bucket workflows. The existing `sync-hub-skills` command remains limited to Hub-provided system/TUI skills by design.

## Goals

- [x] Fix the disappearing session feed in the Hub overlay.
- [x] Reduce initial Hub session detail load time.
- [x] Surface current Hub session availability/read-model fields in the TUI overlay.
- [x] Add replay/history support for paused or history-only sessions.
- [x] Reduce protocol drift between `packages/coder` and the current Hub protocol.
- [x] Add targeted regression tests for the new overlay state logic.

## Work Items

### 1. Overlay feed/detail fixes

- [x] Stop snapshot polling from overwriting live/hydrated stream buffers.
- [x] Seed stream state from snapshot only when needed, then prefer hydration/live SSE.
- [x] Split detail loading from todo loading so the detail screen can render immediately.

### 2. Overlay parity updates

- [x] Extend Hub list/detail models to include current session availability fields.
- [x] Render paused/provisioning/history state and related diagnostics in the overlay.
- [x] Add a Hub overlay resume action for paused sandbox sessions.

### 3. Replay/history support

- [x] Consume `/api/hub/session/:id/replay` for paused/history-only session transcript reconstruction.
- [x] Consume `/api/hub/session/:id/events/history` for richer event history when live SSE is absent.
- [x] Blend replay/history data with live SSE without duplicate buffer resets.

### 4. Protocol alignment

- [x] Expand `packages/coder/src/protocol.ts` to match the current Hub protocol surface used by the TUI package.
- [x] Keep existing runtime imports stable while adding missing snapshot/hydration/RPC types.

### 5. Verification

- [x] Add focused tests in `packages/coder/test/`.
- [x] Run package typecheck.
- [x] Run targeted tests for the new overlay helpers.
