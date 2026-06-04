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
- Temporary backward-compat shims in core (one major version)

### Out (for now)

- `@agentuity/coder` platform package cleanup (follows sandbox migration)
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

Duplicate public surfaces exist:

- Apps/docs: `@agentuity/{service}` (documented)
- CLI/internal: `@agentuity/core` and `@agentuity/core/{service}` (implementation source)

Cross-service deps inside core (affects migration order):

- `oauth/token-storage.ts` → keyvalue interface (type-only)
- `coder/*` → sandbox types and `base64Encode`

## Target Architecture

```
@agentuity/core          errors, logger types, getEnv, schema/type helpers
@agentuity/adapter       FetchAdapter, ServiceException, fetch impl, buildUrl
@agentuity/config        region + service URL resolution (new)
@agentuity/client        shared *Client factory / options base (new, optional)
@agentuity/{service}     types, schemas, *Service, *Client, api-reference
@agentuity/server        platform/CLI APIs (project, org, oauth, deploy, …)
```

User-facing import path after v4:

```typescript
import { KeyValueClient } from '@agentuity/keyvalue';
// NOT @agentuity/core/keyvalue
```

## Open Questions

- [x] **Semver:** Use v4 to remove `@agentuity/core/{service}` subpath exports?
- [x] **Shim duration:** Re-export from core for one major version, or break immediately?
- [x] **New packages:** Approve `@agentuity/config` and `@agentuity/client`? (both added)
- [ ] **URL resolution:** Centralized `getServiceUrls` vs per-service URL helpers (recommend hybrid)?
- [ ] **CLI strategy:** Migrate to `*Client` classes vs keep low-level `*Service` for CLI?
- [ ] **Platform APIs:** Keep in `@agentuity/server` only vs new `@agentuity/platform`?

## Milestones

### Phase 0 — Baseline & guardrails

- [x] Inventory all `@agentuity/core` and `@agentuity/core/{service}` imports (CLI, local, docs, tests)
- [ ] Record install/bundle size baseline per service package
- [x] Lock semver and shim policy (decisions above)
- [ ] Update `docs/scripts/generate-api-reference.ts` plan for new source paths

**Exit:** dependency graph documented, semver decision recorded in Decisions Log.

### Phase 1 — Extract shared infrastructure

- [x] Move HTTP primitives from core → `@agentuity/adapter`:
  - `adapter.ts`, `exception.ts`, `_util.ts` (`buildUrl`, `fromResponse`, `toServiceException`)
- [x] Keep temporary re-exports in core for backward compatibility (core retains canonical copies until Phase 5; adapter owns parallel implementation for service clients)
- [x] Add `@agentuity/config` (or agreed alternative) for region/URL resolution
- [x] Add `@agentuity/client` shared factory to dedupe `*Client` constructors (all service packages)
- [x] Service packages stop importing `@agentuity/core/config` directly

**Exit:** shared client boilerplate centralized; adapter owns HTTP runtime types.

### Phase 2 — Pilot: `@agentuity/keyvalue`

- [x] Move `packages/core/src/services/keyvalue/*` → `packages/keyvalue/src/` (service + types; core copy retained until shim bootstrap solved)
- [x] Update `@agentuity/local` to import types from `@agentuity/keyvalue`
- [x] Update CLI `packages/cli/src/cmd/cloud/keyvalue/util.ts`
- [ ] Point docs API reference generator at keyvalue package
- [ ] Add core shim: `export * from '@agentuity/keyvalue'` (blocked: clean-build cycle adapter→core vs core→keyvalue; needs StructuredError split or export redirect)
- [x] keyvalue: pagination via `@agentuity/client` (zero `@agentuity/core` runtime dep)

**Exit:** keyvalue has zero imports from `@agentuity/core/keyvalue`; core shim works.

### Phase 3 — Roll out remaining services

Tier 1 (storage, few cross-deps):

- [x] stream (implementation in `@agentuity/stream`; core copy retained; CLI util updated)
- [ ] vector
- [ ] email

Tier 2 (medium):

- [ ] schedule
- [ ] webhook
- [ ] db (may need `@agentuity/api` or move `APIClient` with db)

Tier 3 (large):

- [ ] queue
- [ ] task
- [ ] aigateway

Tier 4 (sandbox — migrate before coder cleanup):

- [ ] sandbox

Per service checklist:

- [ ] Move source from core → service package
- [ ] Update CLI cloud util for that service
- [ ] Update docs API reference source path
- [ ] Add core shim re-export
- [ ] Run `tests/services/{service}`

**Exit:** all standalone service packages own their implementation.

### Phase 4 — Platform API separation

- [ ] Move CLI-only domains from core to `@agentuity/server` (or `@agentuity/platform`):
  project, org, oauth, user, region, apikey, deploy, monitoring, session, thread,
  workflow, machine, storage, coder
- [ ] Slim `@agentuity/core` to foundation-only exports
- [ ] CLI depends on `@agentuity/server` + service packages, not monolithic core services

**Exit:** core contains no service or platform implementations.

### Phase 5 — Remove shims (breaking, v4)

- [ ] Delete `packages/core/src/services/{service}/` for migrated packages
- [ ] Remove `@agentuity/core/{service}` subpath exports from core `package.json`
- [ ] Stop `@agentuity/server` re-exporting service clients
- [ ] Add migration guide (v3 → v4 import path changes)
- [ ] Delete this file

**Exit:** single public surface per service; core is foundational only.

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Breaking `@agentuity/core/{service}` imports | Shim re-exports for one major version + migration guide |
| Circular deps (core → keyvalue → core) | Shims only; remove in Phase 5 |
| Docs generator tied to core paths | Update in Phase 0/2 per service |
| CLI is largest core consumer | Migrate CLI utils alongside each service move |
| Publish order complexity | Document: core → adapter → config → services → hono/cli |
| Coder ↔ sandbox coupling | Migrate sandbox before coder package cleanup |

## Publish Order (target)

1. `@agentuity/core` (slim)
2. `@agentuity/adapter`
3. `@agentuity/config`, `@agentuity/client` (if approved)
4. Service packages (parallel after shared infra)
5. `@agentuity/server`, `@agentuity/hono`, `@agentuity/cli`

## Decisions Log

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-06-04 | Plan created on branch `plan/service-package-isolation` | Capture analysis from initial planning session |
| 2026-06-04 | Replace root `PLAN.md` with this plan | Prior monorepo deploy plan superseded by this effort |
| 2026-06-04 | v4 removes `@agentuity/core/{service}` subpaths; shims for one major version | Minimize breakage while migrating imports |
| 2026-06-04 | `@agentuity/adapter` owns HTTP fetch types + util; core keeps copies until Phase 5 | Avoid TS project-reference cycle (adapter ↔ core) |
| 2026-06-04 | `@agentuity/config` owns getEnv + getServiceUrls; core re-exports via shim | No core dep in config package; keyvalue uses config instead of core/config |

## Suggested First Sprint

1. Phase 0 inventory (grep + dependency graph)
2. Phase 1a: move HTTP infra to `@agentuity/adapter` with core shims
3. Phase 2 pilot: `@agentuity/keyvalue` full move

Validate the pattern on the smallest service before touching queue/task/sandbox.
