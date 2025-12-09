# Agentuity VSCode Extension

**Amp Threads**: 
- Original: https://ampcode.com/threads/T-edf8135e-b4a1-4c22-a50a-455e9e5632db
- Review: https://ampcode.com/threads/T-5f13435f-70c9-4783-be95-e97c0b092e8b

## Overview

VSCode extension for developers building on the Agentuity SDK. Provides UI for managing agents, cloud resources, and dev workflow.

## Core Principles

1. **CLI is the single source of truth** - All operations proxy through `agentuity` CLI
2. **AI coding agent friendly** - Expose JSON-returning commands usable by Claude Code, Cursor, Amp
3. **Project-aware** - Agent/data explorer only works inside an Agentuity project (has `agentuity.json`)
4. **Read-only first** - Start with visibility, add CRUD later
5. **Deep-link to Workbench** - Don't embed, just link

## Architecture

```
packages/vscode/
  src/
    extension.ts              # activate/deactivate
    core/
      cliClient.ts            # all CLI spawning, JSON parsing
      auth.ts                 # CLI detection + auth validation
      project.ts              # Agentuity project detection
    features/
      agentExplorer/          # agents tree view
      dataExplorer/           # KV, ObjectStore, Vector, DB trees
      deploymentExplorer/     # deployments tree view
      sessionExplorer/        # sessions tree view
      logsPanel/              # session logs webview panel
      devServer/              # start/stop, status bar, logs
      workbench/              # deep-link commands
      chat/                   # @agentuity chat participant + CLI tool
```

---

## Improvement Plan

Based on review of Jeff's commits (f4b386df, 348dcfd2) and extension architecture analysis.

### P0 - Critical Updates (Based on Runtime Changes) ✅

#### P0.1 - Set TERM_PROGRAM=vscode in CLI Spawning ✅
**Status:** ✅ Complete  
**Effort:** Small  
**Files:** `cliClient.ts`, `devServerManager.ts`

Added `getCliEnv()` to CliClient that sets `TERM_PROGRAM: 'vscode'`. DevServerManager now uses centralized CLI config.

#### P0.2 - Improve Dev Server Readiness Detection ✅
**Status:** ✅ Complete  
**Effort:** Small  
**Files:** `devServerManager.ts`

- Extended timeout to 10s (was 3s)
- Track `hasReceivedOutput` to distinguish no-output vs slow-start
- Set error state and prompt to view logs if no output received
- Properly clear timeout on stop/dispose/error/close

#### P0.3 - Reduce Hardcoded CLI Reference ✅
**Status:** ✅ Complete  
**Effort:** Small  
**Files:** `agentuityParticipant.ts`

- Shortened `CLI_REFERENCE` to minimal `CLI_REFERENCE_FALLBACK`
- Updated system prompt to list slash commands and suggest `/help`
- Fixed `handleFallback` button to suggest `/help` instead of `installCli`

---

### P1 - High-Leverage Improvements ✅

#### P1.1 - Centralize CLI Configuration ✅
**Status:** ✅ Complete  
**Effort:** Small  
**Files:** `cliClient.ts`, `devServerManager.ts`

`getCliPath()` and `getCliEnv()` are exported from `cliClient.ts`. DevServerManager uses the centralized CLI client.

#### P1.2 - Better CLI Error Parsing ✅
**Status:** ✅ Complete  
**Effort:** Medium  
**Files:** `cliClient.ts`

Added `tryParseStructuredError()` to parse JSON errors from CLI output. `CliResult` now includes optional `structuredError` field with `_tag`, `message`, `code`, and `details`.

#### P1.3 - Add More Slash Commands ✅
**Status:** ✅ Complete  
**Effort:** Medium  
**Files:** `agentuityParticipant.ts`, `package.json`

Added new slash commands:
- `/kv [namespace]` - List KV namespaces or keys in namespace
- `/db` - List databases with connection info
- `/vector <namespace> <query>` - Quick vector search
- `/deployments` - List deployments with actions
- `/logs [session-id]` - View session logs

#### P1.4 - Fix handleFallback Button ✅
**Status:** ✅ Complete (in P0.3)  
**Effort:** Small  
**Files:** `agentuityParticipant.ts`

Button now opens chat with `@agentuity /help` query instead of install command.

#### P1.5 - Improve Natural Language Routing ✅
**Status:** ✅ Complete  
**Effort:** Small-Medium  
**Files:** `agentuityParticipant.ts`

Added patterns for: "kv", "key value", "key-value", "database", "db", "connection string", "postgres", "vector", "embedding", "semantic search", "deployment", "log"

---

### P2 - Architectural Improvements ✅

#### P2.1 - Create AgentuityService Facade ✅
**Status:** ✅ Complete  
**Effort:** Medium  
**Files:** `core/service.ts`

Created `AgentuityService` class with:
- `getStatus()` - combined auth/project/dev server state
- `listAgents()`, `listSessions()`, `listDeployments()`, `listDatabases()`
- `listKvNamespaces()`, `listKvKeys()`, `vectorSearch()`
- `getSessionLogs()`, `getCliHelp()`
- `ensureDevServerRunning()` with state change listener

#### P2.2 - Add Cancellation Handling in Chat ✅
**Status:** ✅ Complete  
**Effort:** Small  
**Files:** `agentuityParticipant.ts`

- Added cancellation checks in streaming loop
- `gatherProjectContext()` now accepts optional cancellation token
- Early return with `cancelled` metadata on cancellation

#### P2.3 - Unify Tree Data Provider Pattern ✅
**Status:** ✅ Complete  
**Effort:** Medium  
**Files:** `core/baseTreeDataProvider.ts`, explorer `*TreeData.ts` files

Created `BaseTreeDataProvider<T>` with:
- Common `refresh()`, `forceRefresh()`, `dispose()` logic
- `checkAuthAndProject()` for unified auth/project validation
- `getLoadingItems()`, `getErrorItems()`, `getEmptyItems()` helpers
- Refactored `AgentTreeDataProvider` and `SessionTreeDataProvider` to extend base class

---

### P3 - Future Features

#### P3.1 - Data CRUD Operations
**Status:** 🔲 Todo  
- KV set/delete
- ObjectStore put/delete

#### P3.2 - Code Lenses ✅
**Status:** ✅ Complete  
**Files:** `features/codeLens/agentCodeLensProvider.ts`, `features/codeLens/index.ts`

Added code lenses above `createAgent()` calls:
- **Open in Workbench** - Opens the agent in the Agentuity Workbench (prompts to start dev server if not running)
- **View Sessions** - Filters the sessions explorer by the agent identifier

Features:
- Automatically extracts agent name and identifier from `createAgent()` metadata
- Falls back to inferring identifier from file path (e.g., `src/agent/hello/agent.ts` → `hello`)
- Refreshes lenses when dev server state changes

#### P3.3 - Route/Trigger Management
**Status:** 🔲 Todo  
- Requires CLI commands: `agentuity routes list`, `agentuity cron list`
- Tree view for routes (email, SMS, cron, websocket, SSE)

#### P3.4 - Thread Management
**Status:** 🔲 Todo  
- Requires CLI commands: `agentuity thread list`, `agentuity thread get <id>`
- Display threads in session explorer or separate view

#### P3.5 - Agent Graph Visualization
**Status:** 🔲 Todo  
- Visualize agent relationships and handoffs

---

## Completed Features

### Phase 1: MVP ✅
- [x] Package structure and manifest
- [x] CLI detection + auth gating
- [x] Project detection (`agentuity.json`)
- [x] Agent Explorer sidebar
- [x] Data Explorer sidebar (KV, ObjectStore)
- [x] Deployment Explorer sidebar
- [x] Dev server controls (start/stop/status bar)
- [x] Workbench deep-link command
- [x] AI-facing commands: `getAiCapabilities`, `getAiSchema`
- [x] `@agentuity` chat participant with slash commands

### Phase 2: Enhanced ✅
- [x] Vector search/get from VSCode
- [x] DB connection strings
- [x] Session Logs Panel (bottom panel with filters) - **Primary session viewer**
- [x] Chat participant with `/help`, `/agents`, `/deploy`, `/dev`, `/sessions`, `/status`
- [x] CLI tool for LLM (`agentuity_run_cli`)
- [x] Getting Started walkthrough
- [x] Code Lenses for `createAgent()` calls (Open in Workbench, View Sessions)

**Note:** Session Explorer sidebar was removed in favor of the Session Logs Panel in the bottom panel, which provides a better UX with filtering and log viewing.

---

## CLI Integration Points

**Note:** The `--json` flag goes BEFORE the command: `agentuity --json cloud agent list`

| Feature | CLI Command |
|---------|-------------|
| Detect CLI | `agentuity --version` |
| Check auth | `agentuity --json auth whoami` |
| List agents | `agentuity --json cloud agent list` |
| KV namespaces | `agentuity --json cloud keyvalue list-namespaces` |
| KV keys | `agentuity --json cloud keyvalue keys <namespace>` |
| KV get | `agentuity --json cloud keyvalue get <namespace> <key>` |
| ObjectStore buckets | `agentuity --json cloud objectstore list-buckets` |
| ObjectStore keys | `agentuity --json cloud objectstore list-keys <bucket>` |
| ObjectStore get | `agentuity --json cloud objectstore get <bucket> <key>` |
| ObjectStore URL | `agentuity cloud objectstore url <bucket> <key>` |
| Vector search | `agentuity --json cloud vector search <namespace> <query>` |
| Vector get | `agentuity --json cloud vector get <namespace> <key>` |
| DB list | `agentuity --json cloud db list` |
| DB get | `agentuity --json cloud db get <name>` |
| Deployment list | `agentuity --json cloud deployment list` |
| Deployment show | `agentuity --json cloud deployment show <id>` |
| Deployment logs | `agentuity --json cloud deployment logs <id>` |
| Session list | `agentuity --json cloud session list` |
| Session get | `agentuity --json cloud session get <id>` |
| Session logs | `agentuity --json cloud session logs <id>` |
| AI capabilities | `agentuity --json ai capabilities show` |
| AI schema | `agentuity --json ai schema show` |
| AI prompt/help | `agentuity ai prompt llm` |
| Dev server | `agentuity dev` |
| Deploy | `agentuity cloud deploy` |

---

## Development

```bash
cd packages/vscode
bun install
bun run compile
# Press F5 in VSCode to launch extension host
```

## Publishing

```bash
bun run package  # Creates .vsix file
bunx @vscode/vsce publish
```
