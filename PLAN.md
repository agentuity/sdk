# Plan: Extract Service Implementations out of `@agentuity/core`

**Branch:** `refactor/services-out-of-core`
**Status:** Draft — not yet executing. Plan-first per AGENTS.md.
**Owners:** @huijiro
**Created:** 2026-05-28

---

## Goal

Invert today's dependency direction so that each Agentuity service owns its own implementation, and `@agentuity/core` shrinks back to genuinely cross-cutting primitives (Logger, errors, env, config, adapter contract, schema helpers, pagination, common types).

Concretely:

- `@agentuity/{service}` packages **contain** the service's `*Service` / `*Client` code, instead of re-exporting it from `@agentuity/core/{service}`.
- `@agentuity/cli` depends only on the service packages it actually uses — control-plane / CLI-only services live inside `packages/cli/src/services/` rather than as published packages.
- The recursive dep closure of `@agentuity/cli` no longer drags in code for services the CLI doesn't touch (today it pulls in *every* service via `@agentuity/core`).
- `@agentuity/server`'s `export * from '@agentuity/core'` Phase-2 TODO can be removed.

## Non-goals

- No behavior changes. This is a code-move refactor.
- No public API renames or signature changes.
- No splitting of `@agentuity/core` itself into sub-packages.
- No changes to `@agentuity/adapter`, `@agentuity/schema`, `@agentuity/server` internals beyond removing the re-export shim.
- Not bumping major versions on existing service packages — surface stays compatible.

## Also in scope: delete `@agentuity/local`

The package is unused in this repo (only `PLAN.md` references it). Removing it lets us drop a published package from the v3 surface and is a natural fit for this branch since both changes shrink the dep graph.

## Scope summary

### In scope: services to move OUT of core

**Already have a dedicated package — relocate impl from `core/src/services/{svc}/` to `packages/{svc}/src/`:**

| Service | Package | Today's CLI consumer? | Notes |
|---|---|---|---|
| keyvalue   | `@agentuity/keyvalue`   | yes (`KeyValueStorageService`) | thin wrapper today |
| vector     | `@agentuity/vector`     | yes (`VectorStorageService`)   | thin wrapper today |
| queue      | `@agentuity/queue`      | — | thin wrapper today |
| email      | `@agentuity/email`      | yes (`EmailStorageService`)    | thin wrapper today |
| db         | `@agentuity/db`         | — | thin wrapper today |
| schedule   | `@agentuity/schedule`   | yes (`ScheduleService`)        | thin wrapper today |
| task       | `@agentuity/task`       | yes (`TaskStorageService`, types) | thin wrapper today |
| webhook    | `@agentuity/webhook`    | — | thin wrapper today |
| sandbox    | `@agentuity/sandbox`    | yes (`SandboxInfo` type)       | thin wrapper today |
| stream     | `@agentuity/stream`     | yes (`StreamStorageService`)   | thin wrapper today |
| aigateway  | `@agentuity/aigateway`  | yes (`AIGatewayService`)       | thin wrapper today |
| coder      | `@agentuity/coder`      | yes (`CoderClient`, types)     | thin wrapper today |

### In scope: CLI-only services — move from `core/src/services/{svc}/` to `packages/cli/src/services/{svc}/`

Per decision: **keep these inside CLI, don't publish them as packages.** They're control-plane internals, not for external consumption.

| Service | Used by | Notes |
|---|---|---|
| apikey      | core internal (?) | confirm no external consumer before moving |
| machine     | core internal (?) | confirm |
| monitoring  | core internal (?) | confirm |
| oauth       | cli (`oauthClient*` functions, `oauthScopes`, types) | move to CLI |
| org         | core internal (?) | confirm |
| project     | core internal (?) | confirm |
| region      | core internal (?) | confirm |
| session     | core internal (?) | confirm |
| storage (admin) | cli only | `core/src/services/storage/` is **not** the S3 data-plane client — that's `@agentuity/storage`. It's a separate bucket-admin HTTP API. Moves to `packages/cli/src/services/storage-admin/`. |
| thread      | core internal (?) | confirm |
| user        | core internal (?) | confirm |
| workflow    | cli (`WorkflowService`, `WorkflowGetResultSchema`) | move to CLI |

### Stays in `@agentuity/core` (final shape)

Cross-cutting primitives only:

- `src/error.ts` (`StructuredError`, `RichError`, `isStructuredError`)
- `src/logger.ts` (`Logger`, `LogLevel` types + `createMinimalLogger`)
- `src/json.ts` (`safeStringify`)
- `src/env-example.ts` + `src/services/env.ts` (`getEnv`, `parseEnvExample`, `detectResourceFromKey`)
- `src/services/config.ts` (`getServiceUrls`)
- `src/services/adapter.ts` — type contract only (`FetchAdapter` interface, `FetchRequest`/`FetchResponse`/`Body`/`HttpMethod` schemas + types). Implementation lives in `@agentuity/adapter`. Stays put — the split is already correct.
- `src/services/pagination.ts`
- `src/services/exception.ts` (`ServiceException`, `toServiceException`, `fromResponse`)
- `src/services/api.ts` / `src/services/api-reference.ts` (the `APIClient` base)
- `src/services/_util.ts` (`buildUrl`, etc.)
- `src/services/stats.ts` (cross-service stats type)
- `src/string.ts`, `src/typehelper.ts`, `src/standard_schema.ts`

### Out of scope (this branch)

- Removing the per-service compat shim (`@agentuity/core/{svc}`) — see "Compat shim strategy" below; we're keeping a brief deprecation window inside this same branch but it's the last step.
- Restructuring `@agentuity/server`'s logger/schema/util surface.
- Touching the `pi`, `vscode`, `claude-code`, `opencode`, `react`, `frontend`, `runtime`, `hono`, `local` packages beyond fixing import paths if their builds break.

---

## Compat shim strategy

User said this is a "long refactor, plan first, slowly implement." v3 is still 3.0.0-RC on the `next` tag (not yet `latest`), so we have room — but we should still avoid breaking the dep tree mid-refactor.

**Approach:** during the refactor, `@agentuity/core/{svc}` will *re-export from* `@agentuity/{svc}` (the inverse of today). This lets internal callers migrate gradually without the build going red between commits.

**Final step of the branch:** delete the `@agentuity/core/{svc}` subpath exports entirely and verify no consumer still uses them. Branch lands with the shim removed.

---

## Migration phases

Each phase is a coherent commit (or small commit series). The branch is not mergeable until Phase 8 lands, but every phase should leave the tree green (`bun run all`).

### Phase 0 — Branch + baseline

- [ ] Cut `refactor/services-out-of-core` from `main`.
- [ ] Capture baseline: `bun install`, `bun run all` clean. Snapshot `du -sh packages/cli/node_modules` and the recursive dep list for `@agentuity/cli` so we can measure the win at the end.
- [ ] Confirm every "core internal (?)" row in the table above by grepping the whole monorepo. Update the plan with real consumer lists.

### Phase 1 — Move `keyvalue` (proof of concept)

Pick one service end-to-end first to validate the recipe before doing the other 11.

- [ ] Read `packages/core/src/services/keyvalue/` files. `edit`-paste them verbatim into `packages/keyvalue/src/` (preserving filenames, comments, ordering).
- [ ] Update `packages/keyvalue/src/index.ts` to export from local files instead of `@agentuity/core/keyvalue`. The wrapper `KeyValueClient` stays.
- [ ] In `packages/core/src/services/keyvalue/index.ts`, replace contents with `export * from '@agentuity/keyvalue';` (compat shim, inverted).
- [ ] Add `@agentuity/keyvalue` to `packages/core/package.json` deps (because the shim now points at it).
- [ ] **Watch for circular dep:** `core` ↔ `keyvalue`. `keyvalue` imports `createMinimalLogger`, `getEnv`, `getServiceUrls` from `core`; if `core` then re-exports from `keyvalue`, it's a cycle. Resolution: the shim file in `core` is a leaf re-export, no other `core` module imports it, so Node/Bun ESM can resolve it. Verify with `bun run build` at the workspace root.
  - Fallback if cycles bite: drop the shim for `keyvalue` immediately and migrate CLI's import in the same commit.
- [ ] `bun run all` from repo root. Must be green.

### Phase 2 — Repeat Phase 1 for the other 11 already-packaged services

In order of probable simplicity:

- [ ] `vector`
- [ ] `email`
- [ ] `db`
- [ ] `schedule`
- [ ] `task` (largest — 140KB)
- [ ] `webhook` (104KB)
- [ ] `sandbox` (316KB — largest; **bun-only runtime, watch tsconfig**)
- [ ] `stream`
- [ ] `queue` (256KB)
- [ ] `aigateway`
- [ ] `coder` (280KB)

Each one: read → paste → invert shim → build → test → commit.

### Phase 3 — Move CLI-only services into `packages/cli/src/services/`

Confirm in Phase 0 whether these are actually CLI-only. For each one that is:

- [ ] Create `packages/cli/src/services/{svc}/` and move source there verbatim.
- [ ] Add a compat shim at `packages/core/src/services/{svc}/index.ts`: re-export from the CLI path **only if** there's an external consumer; otherwise just delete the core copy.
- [ ] If any of these turn out to have non-CLI consumers (e.g. runtime / server / hono use them), promote them to a package instead and add them to the Phase 2 list. **Don't silently move something used elsewhere into CLI.**

Candidates: `apikey`, `machine`, `monitoring`, `oauth`, `org`, `project`, `region`, `session`, `thread`, `user`, `workflow`, `storage` (the **bucket-admin** module from `core/services/storage/`, **not** the `@agentuity/storage` S3 package — moves to `packages/cli/src/services/storage-admin/`).

### Phase 4 — Migrate CLI imports off `@agentuity/core` subpaths

- [ ] Replace all `from '@agentuity/core'` (kitchen-sink) imports in `packages/cli/src/**` with the narrowest correct path:
  - Service types/classes → `@agentuity/{svc}` (for the moved-to-package ones) or relative path (for CLI-internal ones).
  - `Logger`, `LogLevel`, `StructuredError`, `isStructuredError`, `safeStringify`, `parseEnvExample`, etc. → keep on `@agentuity/core` (root export).
  - `getServiceUrls` → `@agentuity/core/config`.
- [ ] Update `packages/cli/package.json`:
  - Add explicit deps on the service packages CLI actually imports (`@agentuity/keyvalue`, `@agentuity/vector`, `@agentuity/email`, `@agentuity/schedule`, `@agentuity/task`, `@agentuity/sandbox`, `@agentuity/stream`, `@agentuity/aigateway`, `@agentuity/coder`).
  - Keep `@agentuity/core` for the cross-cutting bits.
- [ ] `bun run all`. Must be green.

### Phase 5 — Migrate `@agentuity/server` off the kitchen-sink re-export

**This phase has external blast radius outside the sdk repo.** See "External consumers" section below; `app` and `infra` are still on v2 today, so they don't break *yet*, but the moment either bumps to v3 they'll hit a wall unless they're migrated alongside this change.

In-repo work:

- [ ] Delete `export * from '@agentuity/core';` from `packages/server/src/index.ts` (kills the Phase-2 TODO).
- [ ] Fix `@agentuity/telemetry`: `import { getServiceUrls } from '@agentuity/server'` → `@agentuity/core/config`.
- [ ] In-repo runtime/hono are unaffected (audited — Hono never used the re-export; runtime is a v2 empty leftover).

Cross-repo work (separate PRs in `app` and `infra`, coordinated with this one):

- [ ] See the External consumers section for the per-symbol migration map.

### Phase 6 — Slim `@agentuity/core`

- [ ] Delete now-empty service folders in `packages/core/src/services/` (the ones that became pure shims).
- [ ] Remove the corresponding entries from `packages/core/package.json` `exports` and `typesVersions`.
- [ ] `bun run all`.

### Phase 7 — Remove compat shims

- [ ] grep the entire workspace for `@agentuity/core/{svc}` subpath imports. Migrate any stragglers.
- [ ] Delete the shim files and their export entries in `packages/core/package.json`.
- [ ] `bun run all`.

### Phase 8 — Remove `@agentuity/local`

Done late in the branch so any unexpected consumer found earlier in the audit can be unwound without rework.

- [ ] `rm -rf packages/local`.
- [ ] Remove from root `package.json` workspaces if listed explicitly (otherwise the glob handles it).
- [ ] grep for `@agentuity/local` across the workspace one more time; clean up any stragglers (`tsconfig.json` references, docs, etc.).
- [ ] Update memory #138 (v3 architecture) to reflect removal.
- [ ] `bun run all`.

### Phase 9 — Verify the win

- [ ] Run `bun install` clean.
- [ ] Compare `packages/cli/node_modules` size vs Phase-0 baseline.
- [ ] Pack the CLI tarball (`bun pm pack` in `packages/cli`) and inspect its dep closure: `npm ls --omit=dev` from a clean install of the tarball. Confirm `@agentuity/queue`, `@agentuity/db`, `@agentuity/webhook` (services the CLI doesn't import) are **not** in the closure.
- [ ] Build all framework demos under `tests/frameworks/` to make sure runtime/hono/local consumers still work end-to-end.
- [ ] Update `PLAN.md` "Decisions log" with final state and **delete `PLAN.md`** per AGENTS.md (it's a working doc, not a permanent artifact).

---

## External consumers

**Tracking issue:** [agentuity/infra#537](https://github.com/agentuity/infra/issues/537) covers both `app` and `infra` migrations off `@agentuity/server` admin imports. Comments on that issue are the canonical place to surface additional v2→v3 needs from other teams.


Audited 2026-05-28. Scope: only `app`, `infra`, and `coder` are tracked as first-class downstream consumers. Other repos (`v3-test-projects/*`, `internal-basic`, `ops-center`, `qualia`, etc.) are either generated fixtures, internal demos, or not on the v3 migration critical path — they'll follow the same migration pattern once these three are sorted.

### Summary table

| Repo | v3 status | Uses `@agentuity/server` kitchen sink? | Already on per-service packages? |
|---|---|---|---|
| `../coder` | **on v3** (`^3.0.0-beta.7`) | No — clean | Yes — imports `@agentuity/{hono,queue,stream,task,sandbox,telemetry,drizzle,schema}` plus `@agentuity/core` for types only |
| `../app` | v2 (`@agentuity/server@2.0.14`) | Yes — heavy | No — imports service APIs via `@agentuity/server` |
| `../infra` | v2 (`@agentuity/server@2.0.21`) | Yes — medium | Partially — service smoke tests use per-package, but root + monitoring use the kitchen sink |

**The good news:** `coder` already follows the target shape. It validates that the per-service package pattern works in practice for a real v3 consumer. Whatever ends up wrong for `coder` after the refactor is wrong for our overall direction.

**The work:** `app` and `infra` need to migrate at the same time they bump to v3, replacing `@agentuity/server` admin imports with per-service-package admin imports.

### `../coder` (on v3-beta.7) — already migrated

**Top-level deps:**
- `@agentuity/drizzle`, `@agentuity/sandbox`, `@agentuity/hono`, `@agentuity/telemetry`, `@agentuity/queue`, `@agentuity/stream`, `@agentuity/task`, `@agentuity/cli`.

**Actual imports across `src/`, `hub-core/`, `tests/`, `drizzle/`, `client/`:**
- `@agentuity/hono` — `agentuity` middleware (1 site)
- `@agentuity/sandbox` — `SandboxClient`, `ExecutionListResponse`, `Job` (5 sites)
- `@agentuity/queue` — `QueueClient` (1 site)
- `@agentuity/stream` — `StreamClient` (1 site)
- `@agentuity/task` — `TaskClient` (1 site)
- `@agentuity/telemetry` — `register` (1 site)
- `@agentuity/drizzle` — query builder (10 sites)
- `@agentuity/schema` — `s` (2 sites)
- `@agentuity/core` — type-only imports: `QueueService`, `StreamStorage`, `UserEntityRef`, `UserType` (10 sites)
- `@agentuity/core/oauth` — `OAuthFlowConfig`, `OAuthTokenResponse`, `OAuthUserInfo` types (3 sites)

**Caveats / known broken bits in coder against v3:**
- `tests/integration/{hub-persistence,agent-builder-routes,session-custom-agents}.test.ts` import `createRouter` from `@agentuity/runtime` (deprecation shim that throws). These tests are already broken vs. v3 and need to be rewritten or removed; not our problem in this refactor.
- `hub-core/agents/expert-{frontend,backend}.ts` contain string-literal prompts referencing `@agentuity/auth`, `@agentuity/react`, `@agentuity/runtime`. These are LLM system prompts, not real imports.

**Implication for the plan:** coder is the proof that this refactor's target shape works. No migration work needed in coder; just verify it still builds against the post-refactor SDK before shipping.

### `../app` (pinned to `@agentuity/core@2.0.14`, `@agentuity/server@2.0.14`)

**Files importing from `@agentuity/server` (16):**
- `lib/util/build.ts` — `SandboxClient`, `SandboxInstance`
- `lib/data/servicesFactory.ts` — `APIClient`
- `lib/data/services.ts` — `APIClient`
- `lib/data/queries/storage.ts` — `createResources`, `deleteResources`, `listOrgResources`, `listResources`
- `lib/data/queries/stream.ts` — `streamDelete`, `streamDeleteNamespace`, `streamListNamespaces`
- `lib/data/queries/database.ts` — `createResources`, `dbLogs`, `dbQuery`, `dbTables`, `deleteResources`, `listOrgResources`, `DbQueryLog`, `TableSchema`
- `lib/data/queries/queue.ts` — ~50 queue symbols (create/list/get/delete/pause/resume/publish/ack/nack/dlq/sources/destinations + types)
- `lib/data/queries/sandbox.ts` — `executionGet`, `executionList`, `runtimeList`, `sandboxGet`, `sandboxList`, `snapshot*` (+ `SandboxInfo`/`SandboxStatus` types from `@agentuity/core`)
- `lib/data/queries/serviceStats.ts` — `getServiceStats`, `ServiceName`, `ServiceStatsData`
- `api/src/webapp/storage.ts` — `getStorageAnalytics`
- `api/src/webapp/database.ts` — `dbLogStats`, `dbLogs`
- `api/src/webapp/sandbox.ts` — `sandboxCreate/Destroy/Execute/...` (full sandbox API surface)
- `api/src/middleware/requireSandboxProject.ts` — `APIClient`
- `web/src/components/screens/services/database/data/DatabaseAuditLogsTab.tsx` — `DbQueryLog` type
- `web/src/components/screens/services/queue/detail/modals/PublishMessageModal.tsx` — string literal (codegen example)
- `web/src/hooks/data/useDatabaseAuditLogs.tsx` — `DbQueryLog` type

**Pattern:** the app is using `@agentuity/server`'s kitchen sink as the **server-side admin SDK** — it manages buckets, queues, sandboxes, dbs, streams via these HTTP API helpers, with auth coming from `APIClient`. This is not user-code-style usage (no `KeyValueClient` etc.); it's control-plane HTTP wrappers.

**Migration target (v3):**
- `APIClient`, `ConsoleLogger`, `createServerFetchAdapter`, `buildClientHeaders`, `getServiceUrls`, `bootstrapRuntimeEnv` → `@agentuity/server` (these are genuine server primitives, they *stay*).
- `dbLogs`, `dbLogStats`, `dbTables`, `dbQuery`, `DbQueryLog`, `TableSchema` → `@agentuity/db` (already a package; expose admin API there).
- `streamDelete`, `streamDeleteNamespace`, `streamListNamespaces` → `@agentuity/stream`.
- `createQueue`, `publishMessage`, `ackMessage`, etc., all queue admin symbols → `@agentuity/queue`.
- `createResources`, `deleteResources`, `listResources`, `listOrgResources` → these are the bucket-admin functions; they belong with the storage admin code being moved to `packages/cli/src/services/storage-admin/` — **but app needs them, so this means storage-admin can't be CLI-internal.** *Revisit Decision: storage admin should become a published `@agentuity/storage-admin` package (or be folded into `@agentuity/storage` as a subpath).*
- `SandboxClient`, `SandboxInstance`, `sandboxGet`, `sandboxList`, `sandboxCreate`, etc., `snapshot*`, `executionGet`, `executionList`, `runtimeList` → `@agentuity/sandbox`.
- `getStorageAnalytics` → storage admin (same as above).
- `getServiceStats`, `ServiceName`, `ServiceStatsData` → needs a home; currently in `core/services/stats.ts`. Probably stays in `@agentuity/server` since it's a cross-service aggregator, or new `@agentuity/stats` package.
- `createWebhook`, `createWebhookDestination`, `listWebhookReceipts` → `@agentuity/webhook`.

### `../infra` (pinned to `@agentuity/server@2.0.21`)

Full deep-dive of every workspace package:

**Apps:**
- `apps/infra-monitor-{usc,use,usw}` — three v2-style apps using `createApp` from `@agentuity/runtime` + `s` from `@agentuity/schema`. **Not part of this refactor's migration** — they need a separate v2→v3 framework migration (likely to Hono via `@agentuity/hono`). Their `@agentuity/runtime` imports already point at the v3 deprecation shim that throws.
- `apps/observability/apps/api` — imports `buildAuthorizeUrl`, `exchangeToken`, `fetchUserInfo` from `@agentuity/core/oauth`. Already on the right shape; `core/oauth` is one of the CLI-internal services in the plan but app/infra consumers force it to stay reachable. Either keep `@agentuity/core/oauth` as a published subpath or extract to `@agentuity/oauth` package.

**Service smoke tests (`tests/services/*`):** 12 directories. 8 already use per-service-package imports (`@agentuity/{queue,vector,schedule,sandbox,task,webhook,keyvalue,email}`) — these are already the target shape. 4 still pull from `@agentuity/server`:
- `tests/services/db/index.ts` — `APIClient`, `ConsoleLogger`, `createResources`, `deleteResources`, `getServiceUrls`. Mix of server primitives (keep) and storage-admin (`createResources`/`deleteResources` — bucket admin, used here for DB *creation* via the unified resources API). Target: keep server primitives, move resources API to wherever storage-admin lands.
- `tests/services/queue-api/index.ts` — `APIClient`, `ConsoleLogger`, `getServiceUrls`, full queue admin (`createQueue`, `publishMessage`, `ackMessage`, `batchPublishMessages`, `nackMessage`, `pauseQueue`, `resumeQueue`, `listMessages`, `listQueues`, `getQueue`, `deleteQueue`, `receiveMessage`). Target: queue admin moves to `@agentuity/queue`.
- `tests/services/storage/index.ts` — `APIClient`, `ConsoleLogger`, `createResources`, `deleteResources`, `getServiceUrls` + `patchBunS3ForStorageDev` from `@agentuity/runtime`. Target: resources API to storage-admin home; runtime patch needs to move to `@agentuity/storage` or be deleted.
- `tests/services/stream/index.ts` — `ConsoleLogger`, `createServerFetchAdapter`, `getServiceUrls` from server + `StreamStorageService` from `@agentuity/core`. Target: `StreamStorageService` moves to `@agentuity/stream` as part of Phase 2.

**Other infra files:**
- `tools/observability/db-performance-benchmark.ts` — same import shape as `tests/services/db`. Same migration.
- `packages/monitoring/src/api/probes.ts` — the most heavily mixed file in infra. Already imports per-service-package wrappers (`DBClient`, `KeyValueClient`, `SandboxClient`) **and** the kitchen sink (`APIClient`, `ConsoleLogger`, `createResources`, `createServerFetchAdapter`, `deleteResources`, `getServiceUrls`, `listResources`) **and** direct core impl (`StreamStorageService`) **and** the dead runtime patch (`patchBunS3ForStorageDev` from `@agentuity/runtime`). Cleanup target: keep server primitives, move `StreamStorageService` to `@agentuity/stream`, move resources API to storage-admin, drop `patchBunS3ForStorageDev` (v2 holdover).

**Summary symbol map for infra:**
- `APIClient`, `ConsoleLogger`, `getServiceUrls`, `createServerFetchAdapter` — stay in `@agentuity/server` (genuine primitives).
- `createResources`, `deleteResources`, `listResources` — storage-admin home (TBD: subpath of `@agentuity/storage` vs separate `@agentuity/storage-admin` package).
- Queue admin (12 symbols) — `@agentuity/queue`.
- `StreamStorageService` — `@agentuity/stream` (as part of Phase 2).
- `patchBunS3ForStorageDev` — dead, must be removed from `packages/monitoring` and `tests/services/storage`.

### Cross-repo migration sequencing

1. Land this branch in sdk with the moves and **`@agentuity/server` still re-exporting from `@agentuity/core`** (don't delete that line until step 3). Service packages now own their impls. `coder` keeps building against this with no changes.
2. In `app` and `infra` PRs, bump to v3 (`@next` tag) and rewrite imports per the map above. These can land at the same time as step 1 because v3-RC's `server` still has the kitchen sink — nothing breaks during transition.
3. After `app` and `infra` are on v3, finally land Phase 5 in sdk: delete `export * from '@agentuity/core'` from `server/index.ts`. This forces the last stragglers to migrate.

This reorders Phase 5: it splits into **5a (in-repo, immediate)** and **5b (deletion, gated on external repos)**. Plan to be updated accordingly when we get there.

### Verification step

Before landing Phase 5b (the kitchen-sink deletion), do a clean `bun install && bun run build` of `coder` against the local sdk build (via `npm link` or `bun link`). It's the only first-class v3 consumer that exists today, and a green build there is the strongest signal we have that we haven't broken downstream.

## Open questions

**Q3: Do we keep the per-service subpath exports on `@agentuity/core` (`/keyvalue`, `/vector`, etc.) permanently with a clear deprecation, or remove them in Phase 7?**
Plan currently says remove. Reconsider in light of `app`/`infra` audit — they import the *symbols* from `@agentuity/server`, not from `@agentuity/core/{svc}`, so removing the core subpaths doesn't affect them. Plan stands.

**Q4: ~~Does the runtime (`@agentuity/runtime`, `@agentuity/hono`) consume service code from `@agentuity/core` or `@agentuity/server`?~~ Answered.**
- `@agentuity/runtime` is a v2 leftover (empty package) — ignore.
- `@agentuity/hono` does **not** depend on `@agentuity/core` or `@agentuity/server`. It only imports the `*Client` wrappers from `@agentuity/{keyvalue,vector,stream,queue,email,task,schedule,sandbox}` and `@agentuity/telemetry`. Phase 5 (killing `server`'s kitchen-sink re-export) is transparent to Hono.
- `@agentuity/telemetry` pulls `Logger`, `LogLevel`, `safeStringify` from `@agentuity/core` (good — those stay) and `getServiceUrls` from `@agentuity/server` via the kitchen-sink re-export. Phase 5 must fix that one import to point at `@agentuity/core/config` directly. Trivial.

---

## Decisions log

- **2026-05-28** — Scope: full migration in one branch, plan-first, slow execution.
- **2026-05-28** — CLI-only services live inside `packages/cli/src/services/`, not as their own published packages.
- **2026-05-28** — Compat shim direction will be inverted (`core` re-exports from service pkg) during the refactor; shim is removed in Phase 7 before the branch lands.
- **2026-05-28** — `core/src/services/storage/` is the bucket-admin HTTP API (control plane), separate from `@agentuity/storage` (S3 data plane). Moves to `packages/cli/src/services/storage-admin/` since only CLI consumes it; can be promoted to a package later if needed.
- **2026-05-28** — `core/src/services/adapter.ts` stays in core as the `FetchAdapter` type contract. `@agentuity/adapter` continues to own the implementation. The split is already correct; no move needed.
- **2026-05-28** — `@agentuity/local` is unused in-repo and will be deleted as part of this branch (Phase 8).
- **2026-05-28** — `@agentuity/runtime` is a v2 empty-package leftover and is out of scope for any audit work.
- **2026-05-28** — `@agentuity/hono` only imports service `*Client` wrappers; never touches `@agentuity/core` or `@agentuity/server`. Refactor is transparent to it.
- **2026-05-28** — `@agentuity/telemetry` has one stray `import { getServiceUrls } from '@agentuity/server'` that needs to be retargeted at `@agentuity/core/config` when Phase 5 kills the kitchen-sink re-export.
- **2026-05-28** — External consumers in scope are `../app`, `../infra`, `../coder` only. Other repos under `/home/huijiro/Dev/agentuity/*` are templates/fixtures/internal demos and follow downstream once the three are sorted.
- **2026-05-28** — `../coder` is already on v3-beta.7 and already imports from per-service packages (`@agentuity/{hono,queue,stream,task,sandbox,telemetry,drizzle,schema}`) plus type-only `@agentuity/core` imports. It does not use `@agentuity/server`'s kitchen sink. It's the target-shape proof and the canary for Phase 5b.
- **2026-05-28** — External consumers `../app` (`@agentuity/server@2.0.14`) and `../infra` (`@agentuity/server@2.0.21`) both treat `@agentuity/server` as the service-API surface. They're on v2 today, so this refactor isn't blocked, but Phase 5 (deleting the kitchen-sink re-export) must be sequenced after they're migrated to v3 with per-package imports. Phase 5 splits into 5a (in-repo) and 5b (external-repo-gated deletion).
- **2026-05-28** — **Reversed earlier decision:** storage-admin (`core/src/services/storage/` — bucket-admin HTTP API) cannot be CLI-internal because `app` consumes `createResources`/`deleteResources`/`listResources`/`listOrgResources`/`getStorageAnalytics`. It needs to be a published package or merged into `@agentuity/storage` as an admin subpath. Decision pending; favor folding into `@agentuity/storage` to avoid yet another package.

---

## Risks

- **Circular deps via inverted shim.** Phase 1 specifically validates this; if it fails, fallback is no-shim with same-commit consumer migration.
- **Hidden cross-package consumers** (esp. from `pi`, `vscode`, `claude-code`, `opencode`). Phase 0 grep across all packages, including extension packages outside the main runtime tree.
- **`@agentuity/sandbox` is bun-only** — its `tsconfig.json` and runtime types differ from sibling packages. Moving impl in may pull bun-specific code into core's compat shim. Resolution: keep shim minimal (just `export *`), no impl in core.
- **Test apps under `tests/`** may import via `@agentuity/server`'s re-export. Phase 5 needs an audit pass.
- **CI build time** may increase short-term due to extra packages in the topological build order. Acceptable.
