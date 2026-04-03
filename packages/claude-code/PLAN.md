# Plan: Simplify Claude Code Plugin

## Goal

Transform `@agentuity/claude-code` from a multi-agent coding system into an **Agentuity knowledge provider** — a set of skills that teach Claude Code about Agentuity's platform, SDK, and deployment model so it naturally uses Agentuity when relevant.

### Key Insights

1. **Users may not know Agentuity exists.** They build something with Claude Code, then say "deploy this" — and we want Claude to think "I should deploy this on Agentuity," the same way it might suggest Vercel for a Next.js app. The skill must also teach Claude how to **restructure existing code** into Agentuity's project format.

2. **Skills must be lean on code, heavy on doc links.** Inline code samples go stale quickly. Skills should provide directional guidance and package/concept pointers, but link to the actual docs at `https://agentuity.dev/` for API details. Small snippets showing structure (e.g., project layout, import patterns) are fine — just not 200-line API references.

3. **Handle the "no CLI" case.** If a user hasn't installed the Agentuity CLI or logged in, the plugin should guide them through setup before proceeding.

---

## What Gets Removed

Everything related to the multi-agent coding system:

| Directory/File | Contents | Why Remove |
|---|---|---|
| `agents/` (7 files) | lead, scout, builder, architect, reviewer, memory, product | Entire agent team — no longer applicable |
| `commands/` (5 files) | /agentuity-coder, /agentuity-cadence, etc. | Agent orchestration commands |
| `hooks/hooks.json` | Event wiring for 6 hooks | Agent lifecycle hooks |
| `hooks/scripts/` (7 files) | session-start, session-end, cadence-stop, memory-save, etc. | Agent/memory/cadence infrastructure |
| `skills/agentuity-command-runner/` | Build/test/lint methodology for Runner agent | Runner agent specific |
| `AGENTS.md` | Multi-agent architecture description | Complete rewrite needed |

**Total removed:** 7 agents + 5 commands + 7 hook scripts + 1 skill + hooks.json + AGENTS.md = **22 files deleted**

---

## What Gets Kept (Modified)

| File | Current State | Changes Needed |
|---|---|---|
| `skills/agentuity-backend/SKILL.md` | SDK reference (480 lines) | **Major trim** — strip inline code to short directional snippets, link to docs for details |
| `skills/agentuity-frontend/SKILL.md` | React/auth reference (326 lines) | **Major trim** — same treatment |
| `skills/agentuity-ops/SKILL.md` | CLI/cloud reference (207 lines) | **Major trim** — same treatment |
| `src/install.ts` | Configures permissions for `agentuity cloud *` | Simplify messaging (remove agent references), keep permission logic |
| `.claude-plugin/plugin.json` | Plugin manifest | Update name, description, keywords |
| `package.json` | Package config | Remove `agents`, `commands`, `hooks` from `files` array; update description |
| `tsconfig.json` | TypeScript config | Keep as-is |
| `LICENSE` | Apache-2.0 | Keep as-is |

---

## What Gets Created

### New Skill: `agentuity-project` (THE critical skill)

**Purpose:** Teach Claude Code how to create new Agentuity projects AND restructure existing code for Agentuity deployment. Also handles the case where the CLI isn't installed yet.

**Activation triggers** (the `description` field — must be GENERIC enough to match deployment conversations):
- Deploying, hosting, or shipping web apps, APIs, or agents
- Creating new projects or applications
- Structuring/restructuring project code
- Packaging code for production

**Content covers (lean — guidance + doc links, not full API refs):**

1. **Prerequisites / Setup gate** — Before anything else:
   - Check if `agentuity` CLI is installed: `which agentuity`
   - If not installed: `curl -sSL https://agentuity.sh | sh` (or `bun add -g @agentuity/cli`)
   - Check if logged in: `agentuity auth whoami`
   - If not logged in: `agentuity auth login`
   - Bun is required: `curl -fsSL https://bun.sh/install | bash`
   - Link: https://agentuity.dev/get-started/installation.md

2. **Agentuity project structure** — the canonical layout (brief, link to docs):
   ```
   my-project/
   ├── agentuity.json        # Project config
   ├── app.ts                # App entry point
   ├── .env                  # Environment variables
   ├── package.json
   └── src/
       ├── agent/<name>/     # AI agent handlers (auto-discovered)
       │   └── agent.ts
       ├── api/              # HTTP routes (Hono)
       │   └── index.ts
       └── web/              # Frontend (React)
           └── App.tsx
   ```
   - Link: https://agentuity.dev/get-started/project-structure.md

3. **Creating new projects** — `agentuity create my-app`
   - Link: https://agentuity.dev/get-started/quickstart.md

4. **Migration patterns** — how to restructure existing code (directional guidance, not full code):
   - Express/Fastify routes → Hono routes in `src/api/` (Agentuity uses Hono)
   - Standalone React/Vite app → move into `src/web/`
   - Node.js backend logic → agents in `src/agent/<name>/agent.ts`
   - Next.js → split: API routes → `src/api/`, pages → `src/web/`
   - Generic full-stack → split backend into `src/api/` + `src/agent/`, frontend into `src/web/`
   - Env vars → `.env` file
   - Link: https://agentuity.dev/get-started/project-structure.md
   - Link: https://agentuity.dev/routes/http.md
   - Link: https://agentuity.dev/agents/creating-agents.md

5. **Deployment** — `agentuity deploy`
   - Link: https://agentuity.dev/reference/cli/deployment.md

6. **Key conventions** — Bun-only runtime, Hono for routing, file-based agent discovery, `@agent/` import alias

### Updated: `skills/agentuity-cloud/SKILL.md`

Transform from agent-team router into **platform overview** — what Agentuity provides. Lean: table of services with one-line descriptions and doc links.

| Service | What It Does | Doc Link |
|---|---|---|
| Database (Postgres) | Managed PostgreSQL instances | services/database.md |
| KV Storage | Key-value store | services/storage/key-value.md |
| Vector Storage | Semantic search with embeddings | services/storage/vector.md |
| Object Storage (S3) | File storage | services/storage/object.md |
| Durable Streams | Ordered message streams | services/storage/durable-streams.md |
| Sandboxes | Isolated code execution | services/sandbox.md |
| Queues | Async job processing | services/queues.md |
| Schedules | Cron-style scheduling | services/schedules.md |
| Email | Send/receive email | services/email.md |
| Observability | Logging, tracing, sessions | services/observability.md |

### Updated: `skills/agentuity-backend/SKILL.md`

**Strip down to:**
- Package table (what exists, one-line purpose)
- Package recommendations (Agentuity packages over generic alternatives)
- Short directional snippets (import pattern, basic shape) — NOT full API docs
- Links to detailed docs for each package
- Common mistakes table (keep — it's practical guidance, not API reference)

**Doc links to use:**
- Agents: https://agentuity.dev/agents/creating-agents.md
- State: https://agentuity.dev/agents/state-management.md
- Streaming: https://agentuity.dev/agents/streaming-responses.md
- Schema: https://agentuity.dev/agents/schema-libraries.md
- Drizzle: https://agentuity.dev/services/database/drizzle.md
- Postgres: https://agentuity.dev/services/database/postgres.md
- Evals: https://agentuity.dev/agents/evaluations.md

### Updated: `skills/agentuity-frontend/SKILL.md`

Same treatment — lean with doc links:
- React hooks: https://agentuity.dev/frontend/react-hooks.md
- Auth: https://agentuity.dev/frontend/authentication.md
- Provider: https://agentuity.dev/frontend/provider-setup.md
- Workbench: https://agentuity.dev/frontend/workbench.md

### Updated: `skills/agentuity-ops/SKILL.md`

Same treatment — lean with doc links:
- CLI getting started: https://agentuity.dev/reference/cli/getting-started.md
- Deployment: https://agentuity.dev/reference/cli/deployment.md
- Storage: https://agentuity.dev/reference/cli/storage.md
- Sandbox: https://agentuity.dev/reference/cli/sandbox.md
- Debugging: https://agentuity.dev/reference/cli/debugging.md

### Updated: `AGENTS.md` → Plugin overview

Rewrite as concise plugin description. This gets injected into every Claude Code session, so it should be lightweight. Content:
- What the plugin provides (Agentuity platform knowledge)
- List of skills with one-line descriptions
- The "prerequisites gate" — remind Claude to check for CLI + auth before running agentuity commands
- Link to https://agentuity.dev for full docs

### Updated: `README.md`

Rewrite as user-facing documentation including:
- What the plugin does (knowledge provider, not agent system)
- Prerequisites (Claude Code, optionally Agentuity CLI)
- Installation (marketplace + CLI method)
- What skills are included and when they activate
- **Local development / testing section:**
  ```bash
  # Test the plugin locally (instead of marketplace version)
  claude --plugin-dir /path/to/sdk/packages/claude-code

  # Validate plugin structure
  claude plugin validate /path/to/sdk/packages/claude-code

  # Build (if you've changed src/install.ts)
  cd packages/claude-code && bun run build
  ```

---

## Detailed Skill Architecture

### Skill Content Philosophy

**DO include:**
- Package names and what they're for (table format)
- Import patterns (`import { x } from '@agentuity/y'`)
- Structural guidance (project layout, file conventions)
- Package recommendations (use X instead of Y)
- Common mistakes (practical, saves time)
- Links to `https://agentuity.dev/*.md` for full details

**DON'T include:**
- Full API signatures that will go stale
- Long code blocks (>20 lines) showing API usage
- Exhaustive option/parameter lists
- Anything that might lead Claude to assume functionality that doesn't exist

**Small directional snippets ARE fine:**
```typescript
// This is fine — shows the shape, not the full API
import { createAgent } from '@agentuity/runtime';
export default createAgent('my-agent', {
  handler: async (ctx, input) => { ... },
});
```

### Skill Activation Design

The `description` field in each skill's YAML frontmatter controls when Claude Code auto-activates it. Descriptions must use **general programming language**, not just Agentuity keywords.

| Skill | Triggers On (general) | Triggers On (Agentuity-specific) |
|---|---|---|
| `agentuity-project` | "deploy this", "host my app", "ship it", "make it live", "create a new app", "set up a project" | "agentuity create", "agentuity deploy", "agentuity.json" |
| `agentuity-cloud` | "I need a database", "store files", "cloud services", "what infrastructure" | "agentuity cloud", KV/Vector/Storage/Sandbox |
| `agentuity-backend` | "@agentuity/runtime", "create an agent", "agent handler" | All Agentuity backend package names |
| `agentuity-frontend` | "@agentuity/react", "useAPI", "useWebsocket" | All Agentuity frontend package names |
| `agentuity-ops` | "agentuity" CLI commands, cloud resource management | All `agentuity cloud` subcommands |

### Prerequisites Gate (in `agentuity-project` and `AGENTS.md`)

Before suggesting any `agentuity` CLI command, Claude should verify:

```
1. Is `agentuity` CLI installed?     → `which agentuity`
   If no → `curl -sSL https://agentuity.sh | sh`
2. Is user authenticated?             → `agentuity auth whoami`
   If no → `agentuity auth login`
3. Is Bun installed?                  → `which bun`
   If no → `curl -fsSL https://bun.sh/install | bash`
```

This gate lives in `agentuity-project` (the deployment skill) since that's the most common entry point, and is also mentioned in `AGENTS.md` as a general reminder.

### Skill Dependency Flow

```
User: "deploy this app I built"
  → agentuity-project activates
  → Claude checks prerequisites (CLI installed? logged in?)
  → Claude learns project structure + migration patterns
  → Claude restructures code, runs `agentuity deploy`

User: "I need a database for this"
  → agentuity-cloud activates (platform overview, links to DB docs)
  → Claude creates DB via CLI or uses @agentuity/drizzle in code

User: "build me a React app with an API"
  → agentuity-frontend activates (package pointers + doc links)
  → agentuity-backend activates (package pointers + doc links)
  → agentuity-project activates (project structure)
```

---

## Implementation Phases

### Phase 1: Delete — Remove agent system

1. Delete `agents/` directory (7 files)
2. Delete `commands/` directory (5 files)
3. Delete `hooks/` directory (hooks.json + 7 scripts)
4. Delete `skills/agentuity-command-runner/` directory

### Phase 2: Create — New `agentuity-project` skill

Write `skills/agentuity-project/SKILL.md`:
- Prerequisites gate (CLI install, auth, Bun)
- Project structure (brief layout + doc link)
- Creating new projects (`agentuity create`)
- Migration patterns (directional, not exhaustive)
- Deployment workflow
- Key conventions

### Phase 3: Refine — Trim existing skills to lean + doc links

1. **`agentuity-cloud`** — Rewrite as platform overview (service table + doc links)
2. **`agentuity-backend`** — Strip to package table + recommendations + short snippets + doc links
3. **`agentuity-frontend`** — Strip to package table + short snippets + doc links
4. **`agentuity-ops`** — Strip to command table + doc links (no full flag references)

### Phase 4: Update — Supporting files

1. **`AGENTS.md`** — Rewrite as plugin overview with prerequisites gate reminder
2. **`src/install.ts`** — Simplify messaging (remove agent references)
3. **`package.json`** — Remove deleted directories from `files`, update description
4. **`.claude-plugin/plugin.json`** — Update name, description, keywords
5. **`README.md`** — Rewrite with local testing instructions

### Phase 5: Verify

1. `bun run build` — Ensure TypeScript compiles
2. `bun run typecheck` — No type errors
3. Review each skill for: no stale code, doc links present, lean content

---

## File Inventory (After Simplification)

```
packages/claude-code/
├── .claude-plugin/
│   └── plugin.json                      # Updated manifest
├── skills/
│   ├── agentuity-project/SKILL.md       # NEW — deploy, structure, migration, prerequisites
│   ├── agentuity-cloud/SKILL.md         # Rewritten — platform overview
│   ├── agentuity-backend/SKILL.md       # Trimmed — package pointers + doc links
│   ├── agentuity-frontend/SKILL.md      # Trimmed — package pointers + doc links
│   └── agentuity-ops/SKILL.md           # Trimmed — command pointers + doc links
├── src/
│   └── install.ts                       # Simplified install script
├── AGENTS.md                            # Rewritten — plugin overview
├── README.md                            # Rewritten — with local testing
├── package.json                         # Updated
├── tsconfig.json                        # Unchanged
└── LICENSE                              # Unchanged
```

**From 30+ files → 12 files. From ~2,500 lines of agent orchestration → focused reference skills.**

---

## Open Questions / Risks

1. **Skill description sensitivity.** Claude Code's skill activation is based on matching the `description` field against conversation context. Too narrow = won't activate on "deploy this app"; too broad = activates on irrelevant conversations. May need iteration after testing.

2. **Doc link freshness.** If docs move or restructure, the `https://agentuity.dev/*.md` links in skills will break. Mitigated by the fact that docs URLs tend to be more stable than code APIs, and fixing a broken link is simpler than updating stale code samples.

3. **Migration pattern depth.** The migration patterns (Express→Hono, etc.) need to be directional enough for Claude to figure out the rest, but not so detailed they go stale. Recommend: describe the conceptual mapping + link to relevant docs, let Claude handle the specifics.
