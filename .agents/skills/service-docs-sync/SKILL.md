---
name: service-docs-sync
description: When editing files under packages/{keyvalue,vector,queue,email,db,schedule,task,webhook,sandbox,stream}/src/**, check whether the change is user-facing and, if so, update the matching page under docs/src/web/content/services/. Run after any commit that touches a service-client package — no exceptions, silently skipping docs is how they rot.
version: 1.0.0
---

# Service Docs Sync

When you change a service-client package, the docs site almost always needs a
matching update. This skill catches the common failure mode where a PR ships
new behaviour but the public docs keep describing the old API.

## Scope

Applies only to the following packages — the ones whose APIs end up in user
code:

| Package | Docs page(s) |
| --- | --- |
| `@agentuity/keyvalue` | `docs/src/web/content/services/storage/key-value.mdx` |
| `@agentuity/vector` | `docs/src/web/content/services/storage/vector.mdx` |
| `@agentuity/stream` | `docs/src/web/content/services/storage/durable-streams.mdx` |
| `@agentuity/queue` | `docs/src/web/content/services/queues.mdx` |
| `@agentuity/email` | `docs/src/web/content/services/email.mdx` |
| `@agentuity/db` | `docs/src/web/content/services/database/index.mdx`, `postgres.mdx`, `drizzle.mdx` |
| `@agentuity/schedule` | `docs/src/web/content/services/schedules.mdx` |
| `@agentuity/task` | `docs/src/web/content/services/tasks.mdx` |
| `@agentuity/webhook` | `docs/src/web/content/services/webhooks.mdx` |
| `@agentuity/sandbox` | `docs/src/web/content/services/sandbox/index.mdx`, `sdk-usage.mdx`, `snapshots.mdx` |

Not in scope:
- Other packages (`cli`, `hono`, `adapter`, `core`, `schema`, `postgres`,
  `drizzle`, `telemetry`, `analytics`, `coder`, `coder-tui`, `vscode`,
  `claude-code`, `opencode`, `migrate`, `local`, `test-utils`, `runtime`,
  `server`). Those have their own docs story owned elsewhere.
- Test files (`test/**`, `*.test.ts`), tsconfig, package.json changes that
  don't alter runtime behaviour.

## When to activate

Run this skill immediately after you change any file under
`packages/<service>/src/**` for a service in the table above, before you
open (or finalize) a PR. Don't skip it "just this once" — missed docs
updates compound.

## What counts as "user-facing"

Use judgement; these are the categories that almost always require a docs
update. If any of them apply, update the docs.

### Almost always user-facing

- **New public export** — any new `export` from `src/index.ts` (function,
  class, type, const, enum). Even if it's an overload or a narrower variant
  of an existing export.
- **Changed signature on an existing export** — added/removed/renamed
  parameters, changed parameter types, changed return type, added
  overloads.
- **Changed default value** — any argument default or option default that
  users rely on.
- **New or changed option on a config/options object** — e.g. adding
  `timeout?: number` to a client constructor. Users discover these through
  docs.
- **New or changed error type** — new `StructuredError` variant, new
  thrown class, new error shape returned. Affects user error-handling
  code.
- **Renamed public export** — even with a re-export alias for
  compatibility, the docs need the new name.
- **New environment variable read by the client** — e.g. the client now
  reads `AGENTUITY_FOO_URL`. Users need to know it exists.
- **Changed wire format** — request/response body shape, query-string
  params, HTTP method, status codes users observe.
- **Changed CLI output** for any CLI surface documented in the docs site.

### Sometimes user-facing — judge with care

- **Changed error messages** — if users grep logs or parse strings, yes.
  If the message is informational only, probably no.
- **Performance characteristics** — mention only if the docs claim a
  specific SLA / latency / throughput that's no longer true.
- **New retry/backoff behaviour** — yes if observable (timing, logs); no
  if pure internal.

### Not user-facing — skip the skill

- Internal refactors that leave the public export list and signatures
  identical.
- Comment / JSDoc edits that are not part of the exported API surface.
- Test-only changes.
- Build/tooling changes (tsconfig, bunfig, package.json scripts).
- Dependency bumps that don't change behaviour users observe.

When in doubt, treat it as user-facing and update the docs. Docs debt is
expensive; a 3-minute docs PR isn't.

## Workflow

### 1. Identify what you changed

```bash
# From the root of the repo
git diff --stat HEAD -- 'packages/<service>/src/**'
```

Focus on changes to:
- `packages/<service>/src/index.ts` (most user-facing)
- Files exported from `index.ts` (follow re-exports)
- Type definition files
- Any file that defines a class, function, or const that is re-exported

### 2. Read the matching docs page(s)

From the table above. Open the full page, not just grep for your symbol —
user-facing code changes often cascade (example code gets stale, option
tables get out of date, "see also" links shift).

### 3. Decide: does any category in "Almost always user-facing" apply?

If yes → update docs this PR. Don't leave a TODO.
If no and "Sometimes" category matches → make the judgement call; bias
toward updating.
If no to everything → skip, note why in the PR description if the diff
looks alarming ("refactors internals of X, no public API change").

### 4. Update the docs

Typical edits you'll make in the `.mdx` files:
- Update code samples to use the new signature / options
- Add an entry for a new export to the page's symbol reference (if it
  lists them)
- Add / update the option table for a changed options object
- Add a short migration note at the top of the page if behaviour
  silently changes
- Fix cross-page links if you moved or renamed a symbol

Docs pages use MDX; front-matter keys like `title`, `description`, and
`order` at the top should be preserved exactly.

### 5. Verify

Before committing docs:
```bash
cd docs && bun run typecheck
```

The SDK Explorer has its own dev server if you want a visual check:
```bash
cd docs && bun run dev
```

### 6. Commit

Include the docs update in the same PR as the code change — not a
follow-up. Split the commit if you prefer
(`feat(queue): add idempotency key option` + `docs(queue): document
idempotency option`), but keep them in the same PR so review catches any
drift between the two.

## Anti-patterns

- **"I'll update docs after this merges"** — you won't. Someone else will
  discover stale docs three releases later.
- **"Docs are owned by someone else"** — true at the macro scale (full
  rewrites), false for incremental API changes. If you changed
  `packages/keyvalue/src/index.ts`, you own the matching paragraph in
  `key-value.mdx`.
- **"It's only a bug fix"** — if the bug changed observable behaviour,
  the docs need to match the new (correct) behaviour.
- **Updating only the code example and not the surrounding prose** —
  examples become stale because the prose around them still describes
  the old API. Re-read the whole page section, not just the fenced
  block.

## If the docs page doesn't exist

If you're introducing an entirely new service client (rare), create a
new `.mdx` page under `docs/src/web/content/services/` mirroring the
structure of an existing one (e.g. `queues.mdx` is a good template),
and add it to the nav in `docs/src/web/components/docs/nav-data.ts`.

## Memory pointers

- Memory #105 (docs rewrite) covers the broader *structural* docs
  cleanup — not this skill's concern. This skill is purely about
  keeping specific pages in sync with specific code as changes land.
- Memory #78 (v3 overview) explains what each service package is for.
