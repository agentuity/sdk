# Service Package Isolation Plan

Working document for decoupling Agentuity service packages from `@agentuity/core`.
Delete this file once the plan is fully executed.

## Goal

Make each `@agentuity/{service}` package self-contained: it owns its types, schemas,
HTTP client implementation, and public `*Client` wrapper. Installing one service
package should not pull in the full core service catalog (~60k+ LOC under
`packages/core/src/services/`).

## Scope

### In

- Standalone service packages: `keyvalue`, `vector`, `stream`, `queue`, `email`,
  `schedule`, `task`, `webhook`, `sandbox`, `aigateway`, `db`
- Shared HTTP/client infrastructure currently duplicated across service packages
- CLI cloud command utils that import `*StorageService` from core
- Docs API reference generator paths (`packages/core/src/services/*/api-reference.ts`)
- `@agentuity/local` imports of service types from core
- In-repo migration off internal `@agentuity/core/{service}` import paths (not a supported app surface)

### Out (for now)

- `@agentuity/schema` deprecation (separate effort)
- Runtime/agent context wiring (`@agentuity/hono`, `@agentuity/runtime`) — already
  uses service packages correctly
- Infra/platform API redesign beyond moving code to `@agentuity/server`

## Current State (baseline)

Service packages are thin facades. Implementation lives in core:

| Package    | Package LOC | Core LOC | Notes                          |
| ---------- | ----------- | -------- | ------------------------------ |
| keyvalue   | ~250        | ~2,000   | Smallest pilot candidate       |
| stream     | ~212        | ~3,318   |                                |
| vector     | ~282        | ~3,168   |                                |
| email      | ~300        | ~3,672   |                                |
| db         | ~280        | ~1,148   | Uses `APIClient` from core     |
| schedule   | ~236        | ~2,178   |                                |
| webhook    | ~380        | ~5,584   |                                |
| aigateway  | ~338        | ~3,654   |                                |
| queue      | ~208        | ~15,190  |                                |
| task       | ~512        | ~8,528   |                                |
| sandbox    | ~44         | ~16,150  | Pure re-export today           |

Every service package repeats the same wiring:

- `getEnv` for API key, region, service URL
- `getServiceUrls(region)` from `@agentuity/core/config`
- `createMinimalLogger`, `buildClientHeaders`, `createServerFetchAdapter`

Duplicate surfaces exist:

- **Supported (apps/docs):** `@agentuity/{service}`, `@agentuity/hono`, `@agentuity/runtime`
- **Internal (monorepo only):** `@agentuity/core`, `@agentuity/core/{service}`, `@agentuity/server` — not for deployed user code

Cross-service deps inside core (affects migration order):

- `oauth/token-storage.ts` → keyvalue interface (type-only)
- `coder/*` → sandbox types and `base64Encode`

## Target Architecture

```
@agentuity/adapter       StructuredError, safeStringify, Logger, FetchAdapter, ServiceException
@agentuity/config        region + service URL resolution
@agentuity/client        shared *Client factory / options base
@agentuity/core          createMinimalLogger, env helpers, runtime service copies (Phase 5 dedup)
@agentuity/{service}     types, schemas, *Service, *Client, api-reference
@agentuity/server        platform/CLI APIs (project, org, oauth, deploy, …)
```

## Semver (target: **3.1.0**)

This refactor is **internal package layout**, not a user-facing API redesign.

**Supported surface (unchanged):** `@agentuity/{service}`, `@agentuity/hono`, `@agentuity/runtime`.
Same types, same clients, same behavior — that is what **3.1.0** semver covers.

**Internal surface (not supported for apps):** `@agentuity/core/{service}` subpaths, deep
imports from `@agentuity/core` service trees, `@agentuity/server` in user apps. No one
should rely on these; fixing or removing them is **in-repo cleanup**, not a major release
concern and not something we design shims around for external users.

| Release | What ships |
| ------- | ---------- |
| **3.1.0** (this effort) | Service packages own implementation; platform admin on `@agentuity/server`; shared packages (`adapter`, `config`, `client`, `api`); slimmer `@agentuity/core` |
| **3.x minors** (optional) | Delete core duplicate trees, drop internal subpath exports once monorepo is clean |
| **4.0.0** (later, separate) | Only for intentional **documented** API breaks |

```typescript
// Supported — unchanged
import { KeyValueClient } from '@agentuity/keyvalue';
```

## Open Questions

- [x] **Semver:** Ship isolation as **3.1.0** (minor); no major bump for package moves alone
- [x] **Internal imports:** `@agentuity/core/{service}` is unsupported; migrate monorepo callers — not a user compat / shim problem
- [x] **New packages:** Approve `@agentuity/config` and `@agentuity/client`? (both added)
- [ ] **URL resolution:** Centralized `getServiceUrls` vs per-service URL helpers (recommend hybrid)?
- [ ] **CLI strategy:** Migrate to `*Client` classes vs keep low-level `*Service` for CLI?
- [ ] **Platform APIs:** Keep in `@agentuity/server` only vs new `@agentuity/platform`?

## Milestones

### Phase 0 — Baseline & guardrails

- [x] Inventory all `@agentuity/core` and `@agentuity/core/{service}` imports (CLI, local, docs, tests)
- [ ] Record install/bundle size baseline per service package
- [x] Lock semver policy (decisions above)
- [ ] Update `docs/scripts/generate-api-reference.ts` plan for new source paths

**Exit:** dependency graph documented, semver decision recorded in Decisions Log.

### Phase 1 — Extract shared infrastructure

- [x] Move HTTP primitives from core → `@agentuity/adapter`:
  - `adapter.ts`, `exception.ts`, `_util.ts` (`buildUrl`, `fromResponse`, `toServiceException`)
- [x] Core retains duplicate copies until Phase 5 deletes them (adapter owns parallel HTTP impl for service clients)
- [x] Add `@agentuity/config` (or agreed alternative) for region/URL resolution
- [x] Add `@agentuity/client` shared factory to dedupe `*Client` constructors (all service packages)
- [x] Service packages stop importing `@agentuity/core/config` directly

**Exit:** shared client boilerplate centralized; adapter owns HTTP runtime types.

### Phase 2 — Pilot: `@agentuity/keyvalue`

- [x] Move `packages/core/src/services/keyvalue/*` → `packages/keyvalue/src/` (service + types; core copy retained until shim bootstrap solved)
- [x] Update `@agentuity/local` to import types from `@agentuity/keyvalue`
- [x] Update CLI `packages/cli/src/cmd/cloud/keyvalue/util.ts`
- [ ] Point docs API reference generator at keyvalue package
- [x] Add core shim: `export * from '@agentuity/keyvalue'` (duplicate service/types removed; api-reference stays in core until docs move)
- [x] keyvalue: pagination via `@agentuity/client` (zero `@agentuity/core` runtime dep)

**Exit:** keyvalue has zero imports from `@agentuity/core/keyvalue`; core shim works.

### Phase 3 — Roll out remaining services

Tier 1 (storage, few cross-deps):

- [x] stream (runtime in `@agentuity/stream`; core shim; platform CLI types in core `stream/types.ts` for docs only; admin APIs in `@agentuity/server`)
- [x] vector (core shim; zero `@agentuity/core` runtime dep in package)
- [x] email (core shim; zero `@agentuity/core` runtime dep in package)

Tier 2 (medium):

- [x] schedule (core shim; zero `@agentuity/core` runtime dep)
- [x] webhook (core runtime shim; platform types in core `webhook/types.ts` for docs; admin APIs in `@agentuity/server`)
- [x] db (core shim; uses `@agentuity/api` + `@agentuity/adapter`)

Tier 3 (large):

- [x] queue (core runtime shim; platform types in core `queue/types.ts` for docs; admin APIs in `@agentuity/server`)
- [x] task (core shim; zero `@agentuity/core` runtime dep)
- [x] aigateway (core shim; zero `@agentuity/core` runtime dep)

Tier 4 (sandbox — migrate before coder cleanup):

- [x] sandbox (core shim; runtime in `@agentuity/sandbox`)
- [x] coder (core shim; uses `@agentuity/api` + `@agentuity/adapter` + `@agentuity/sandbox`)

Per service checklist:

- [ ] Move source from core → service package
- [ ] Update CLI cloud util for that service
- [ ] Update docs API reference source path
- [ ] Add core shim re-export
- [ ] Run `tests/services/{service}`

**Exit:** all standalone service packages own their implementation.

### Phase 4 — Platform API separation

- [x] Pilot: move `user`, `org` env, `project` (get/list/malware), `region` create into `@agentuity/server`; wire sandbox stubs to `@agentuity/sandbox`
- [x] Move `session`, `thread`, `apikey` into `@agentuity/server`
- [x] Move remaining platform domains: `oauth`, `org` (list/resources), `project` (deploy/env/create/…), `region` (list/delete/resources), `machine`, `monitoring`, `storage`, `workflow`, `stats`
- [x] Move queue/stream/webhook platform admin APIs into `@agentuity/server`; slim core main barrel to runtime `*Service` only for those three
- [x] Wire sandbox runtime through `@agentuity/sandbox` on server; move `cliSandboxList` into server; drop sandbox from core main barrel
- [x] Trim platform symbols from `@agentuity/core` main barrel (subpath copies retained until Phase 5)
- [ ] Point CLI service imports at `@agentuity/{service}` instead of `@agentuity/core` types where applicable
- [ ] Remove service implementations from `@agentuity/core` main barrel (Phase 5)

**Exit:** platform code lives in `@agentuity/server`; core main barrel is runtime services
only. Ready to publish as **3.1.0** once remaining CLI/docs cleanup and verification pass.

### 3.1.0 release checklist

- [x] Monorepo typecheck, test, and publish order verified (`bun run all` passed 2026-06-15)
- [ ] Changelog: internal refactor + new packages; **no** required import changes on supported app paths (generated at publish via `scripts/publish.ts`)
- [x] No remaining in-repo imports of `@agentuity/core/{service}` from CLI, local, docs, or tests (grep clean; comments/docs examples excepted)
- [x] `@agentuity/local` uses `@agentuity/{service}` for storage interfaces
- [x] `@agentuity/server` uses `@agentuity/api` for platform HTTP (not `@agentuity/core/api`)
- [x] CLI uses `@agentuity/server` + `@agentuity/{service}` for supported paths (foundation types from `@agentuity/core` OK)

### Phase 5 — Delete core duplicates (in-repo cleanup)

Can land in **3.1.0** or a follow-up **3.x minor** once the monorepo no longer imports
internal paths. Not blocked on external migration — there is no supported external use of
`@agentuity/core/{service}`.

- [x] Delete runtime duplicates under `packages/core/src/services/{service}/` (shims in place; api-reference + doc-only platform types for queue/webhook/stream remain)
- [ ] Remove `@agentuity/core/{service}` subpath exports from core `package.json`
- [ ] Replace with thin re-exports only where cycles still require a core entry (goal: none)
- [ ] Update docs API reference generator to read from service packages
- [ ] Delete this file

**Exit:** `@agentuity/core` is foundation only; one implementation per service in
`@agentuity/{service}`.

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Internal `@agentuity/core/{service}` imports left in repo | Grep and fix in CLI/local/docs/tests; unsupported path — not a semver/shim concern |
| Circular deps (core → keyvalue → core) | Shims only; remove in Phase 5 |
| Docs generator tied to core paths | Update in Phase 0/2 per service |
| CLI is largest core consumer | Migrate CLI utils alongside each service move |
| Publish order complexity | Document: core → adapter → config → services → hono/cli |
| Coder ↔ sandbox coupling | Migrate sandbox before coder package cleanup |

## Publish Order (target)

1. `@agentuity/adapter` (foundation: errors, json, logger types, HTTP)
2. `@agentuity/config`, `@agentuity/client`
3. Service packages (parallel; no `@agentuity/core` dep when clean)
4. `@agentuity/core` (depends on adapter + service shims until Phase 5)
5. `@agentuity/server`, `@agentuity/hono`, `@agentuity/cli`

## Decisions Log

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-06-04 | Plan created on branch `plan/service-package-isolation` | Capture analysis from initial planning session |
| 2026-06-04 | Replace root `PLAN.md` with this plan | Prior monorepo deploy plan superseded by this effort |
| 2026-06-04 | v4 removes `@agentuity/core/{service}` subpaths; shims for one major version | **Superseded** — see 2026-06-10 |
| 2026-06-10 | Ship isolation as **3.1.0** (minor), not 4.0.0 | Supported app APIs unchanged; internal core subpaths are not a user compat surface |
| 2026-06-10 | No external shim policy for `@agentuity/core/{service}` | Apps must not import it; monorepo cleanup only — removing subpaths is not a major release |
| 2026-06-04 | `@agentuity/adapter` owns HTTP fetch types + util; core keeps copies until Phase 5 | **Superseded** — adapter owns errors/json/logger; core re-exports |
| 2026-06-10 | `@agentuity/adapter` owns `StructuredError`, `safeStringify`, `Logger`; core → adapter dep | Breaks adapter→core cycle; `@agentuity/keyvalue` install no longer pulls core |
| 2026-06-04 | `@agentuity/config` owns getEnv + getServiceUrls; core re-exports via shim | No core dep in config package; keyvalue uses config instead of core/config |
| 2026-06-04 | `@agentuity/api` owns `APIClient` + platform errors; core keeps parallel copy until Phase 4 | api→core dep (StructuredError) blocks core shim; duplicate classes are not interchangeable across packages |

### Phase 1 — Extract shared infrastructure

- [x] Add `@agentuity/adapter` for HTTP fetch types + util
- [x] Move `StructuredError`, `safeStringify`, `Logger` into `@agentuity/adapter`; core re-exports (adapter no longer depends on core)
- [x] Add `@agentuity/config` for getEnv + getServiceUrls; core re-exports via shim
- [x] Add `@agentuity/client` for shared client wiring
- [x] Add `@agentuity/api` for platform HTTP (`APIClient`, Pulse response schemas, platform errors); core `services/api.ts` re-exports

**Exit:** Service packages can depend on adapter/config/client without pulling `@agentuity/core`.


1. Phase 0 inventory (grep + dependency graph)
2. Phase 1a: move HTTP infra to `@agentuity/adapter` with core shims
3. Phase 2 pilot: `@agentuity/keyvalue` full move

Validate the pattern on the smallest service before touching queue/task/sandbox.
