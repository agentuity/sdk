# @agentuity/coder

Lightweight [Pi TUI](https://github.com/mariozechner/pi-coding-agent) extension that connects to the Agentuity Coder Hub.

## Purpose

This package is a **pure protocol adapter** between Pi's extension API and the Coder Hub server. It contains zero hardcoded tool schemas or agent definitions — everything is driven by the server's `InitMessage` at startup.

The extension runs inside **Pi's Node.js process**, not the Agentuity runtime.

## Architecture

| File | Lines | Role |
|------|-------|------|
| `src/index.ts` | ~660 | Main extension entry — tool/event registration, sub-agent execution |
| `src/handlers.ts` | ~100 | Action processing (ACK, BLOCK, RETURN, NOTIFY, CONFIRM, etc.) |
| `src/protocol.ts` | ~130 | TypeBox protocol types (InitMessage, requests, actions, responses) |
| `src/client.ts` | ~145 | HubClient — WebSocket client with request/response correlation |

## Connection Flow

1. **Extension loads** — `agentuityCoderHub(pi)` is called by Pi
2. **Sync bootstrap** — `fetchInitMessageSync()` calls Hub's REST `/api/hub/init` endpoint via `curl` + `execFileSync` to discover available tools and agents _before_ registration returns
3. **Tool registration** — Hub tools (memory, context7, etc.) are registered with Pi using server-provided JSON Schemas
4. **Lazy WebSocket** — On first event (`session_start`), a persistent WebSocket connection is established for runtime communication
5. **Event proxy** — Pi lifecycle events are forwarded to Hub; Hub responds with actions (ACK, BLOCK, SYSTEM_PROMPT, etc.)
6. **Tool execution** — When Pi invokes a Hub tool, the request is sent over WebSocket and the RETURN action result is passed back

## Sub-Agent Flow

1. **Lead delegates** — Lead agent calls the `task` or `parallel_tasks` tool
2. **In-process session** — `runSubAgent()` creates a Pi `createAgentSession()` inside the same process (no subprocess spawning)
3. **Hub tools via extensionFactories** — Sub-agents receive Hub tools (memory, context7, etc.) through Pi's `extensionFactories` mechanism, sharing the parent's WebSocket connection
4. **Isolation** — Sub-agents run with `noExtensions: true` to prevent recursive task tool registration
5. **Output limits** — Results are truncated to 200KB / 5K lines to prevent context bloat

## Requirements

- **`curl` binary** — Required for the synchronous REST bootstrap (`fetchInitMessageSync`). Available by default on macOS, Linux, and Windows 10+.
- **Pi coding agent** — This extension is loaded by Pi's extension system.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTUITY_CODER_HUB_URL` | Yes | WebSocket URL for the Coder Hub (e.g., `ws://localhost:3000/api/ws`) |
| `AGENTUITY_CODER_AGENT` | No | Agent role name. If set, the extension runs as a sub-agent (not lead). |

## Design Decisions

### Why `curl` + `execFileSync`?

Pi's extension registration is **synchronous** — tools must be registered before the extension function returns. Node's `fetch()` is async-only, and `Bun.spawnSync` isn't available in Pi's Node.js runtime. Using `curl` via `execFileSync` is the simplest way to make a synchronous HTTP request without adding dependencies.

### Why no hardcoded schemas?

The Hub server is the single source of truth for tool definitions, agent configurations, and system prompts. This keeps the extension thin and allows the Hub to evolve without extension updates.
