# PLAN: Monorepo support for `agentuity deploy`

## Goal

A user can run `agentuity deploy` from inside a monorepo subpackage that has `workspace:*` (or `workspace:^`, `workspace:~`, `link:`, `portal:`, etc.) refs in its `package.json`, and the deploy works — the workspace deps resolve, the app builds, and the container starts the right process from the right working directory.

Today, deploying from a monorepo subpackage fails: the build packages only the subdir, ships a `package.json` containing `"@org/shared": "workspace:*"`, and Hadron's `npm ci --omit=dev` chokes because `workspace:*` is not a valid npm range. There's no way to fix it on the user side short of restructuring their repo.

## Scope

### In
- npm workspaces (`package.json.workspaces`)
- pnpm workspaces (`pnpm-workspace.yaml`)
- yarn workspaces (`package.json.workspaces`)
- bun workspaces (`package.json.workspaces`)
- The user runs `agentuity deploy --dir <subpackage>` or runs it from inside a subpackage (we walk up to find the monorepo root).
- Build, package, upload, runtime install, and launch all do the right thing for the target subpackage.
- The deployed app's working directory at runtime is the subpackage path inside the deploy tree.

### Out (for now)
- Turborepo `turbo prune --docker` integration. Nice-to-have for shrinking uploads, separate follow-up.
- pnpm `pnpm deploy --filter` integration. Same.
- Non-JS monorepos (Cargo workspaces, Nx Python, etc.). Not in v3 buildpack scope.
- Cross-region builds. Out of scope.
- Auto-resolving workspace deps and inlining them as `file:` (option A from the design discussion). We picked option B.

## Decisions log

- **2026-05-19** — Picked "deploy the monorepo, run from a subpackage" (option B) over "resolve and inline workspace deps" (option A). Reasoning: option B works for arbitrary transitive workspace graphs, doesn't require us to reimplement each pm's workspace resolver, and matches what real platforms (Vercel, Render, Fly, Railway) do.
- **2026-05-19** — Use `processes[].workingDirectory` (already in `LaunchMetadata` schema) for the launch-time `cwd`. No new launch.json field required.
- **2026-05-19** — De-risked end-to-end with a hand-crafted npm-workspaces fixture (`v3-test-projects/v3-monorepo-fixture`, Hono web app + `@v3fx/shared` package, bundle keeps `@v3fx/shared` external so the runtime install is exercised). Dropped a hand-written `launch.json` at the monorepo root with `workingDirectory: "apps/web"`, ran `agentuity deploy --dir <monorepoRoot>`. Hadron's `npm ci --omit=dev` resolved npm workspaces correctly, pilot honored `workingDirectory`, the deployed URL returned `hello monorepo from the shared workspace`. Deploy: `deploy_d1233b6fbf348073b33722bafbcf8e12`. **Platform side is ready; remaining work is all SDK-side automation.**
- **2026-05-19** — Extracted a shared `runBuildPipeline` in `packages/cli/src/cmd/build/run.ts`. Both `agentuity build` (`cmd/build/index.ts`) and the deploy command's build step (`cmd/cloud/deploy/build.ts`) now go through the same function. Picked typecheck-BEFORE-build as the canonical order (was inconsistent between the two paths before). Structured errors (`FrameworkDetectionError`, `TypecheckError`) bubble back up so each caller can render them on its own surface (`tui.fatal` vs `stepError`).
- **2026-05-19** — First fully-automated monorepo deploy via the SDK: `deploy_51f98243a9b86ec47731c29b3019107e`, serving `hello monorepo from the shared workspace` from `https://v3fx-web-fd622ba-gabriel-test-bed.agentuity.run/`. No hand-written `launch.json`, no manual staging. Two real bugs surfaced and fixed in the process:
   - `detectPackageManager` runs against the *subpackage* dir which has no lockfile, so it defaulted to bun. Override `framework.packageManager = monorepo.packageManager` in `runBuildPipeline` when monorepo context is present.
   - `copyRuntimeManifests` shipped every lockfile it found; Hadron's preference order (bun > npm > pnpm > yarn) then picked a stale one. Now takes a `packageManager` arg and ships only the matching lockfile family.

## Design

### Detection: monorepo root + target subpackage

When `agentuity deploy` is invoked from `--dir <projectDir>`, walk up from `projectDir` looking for a monorepo marker:

| Marker file | Tool |
|---|---|
| `pnpm-workspace.yaml` | pnpm |
| `package.json` with a `workspaces` field (array or `{packages: [...]}`) | npm / yarn / bun |
| `bun.lockb` or `bun.lock` at a level above with a `workspaces` field | bun |

Stop at the first match — that's the monorepo root. If none found before the filesystem root or a `.git` boundary, treat `projectDir` as a regular (non-monorepo) project — current behavior.

Once we have the root, the subpackage's relative path is `relative(monorepoRoot, projectDir)`.

For pnpm: parse `pnpm-workspace.yaml` to confirm `projectDir` matches one of the workspace globs (for sanity / better errors).

Result: a `MonorepoContext | null`:
```ts
interface MonorepoContext {
  root: string;             // absolute path
  subpath: string;          // posix path, relative to root, e.g. 'apps/web'
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun';
  // The detected framework still applies to the subpackage. The monorepo
  // context just tells the rest of the pipeline how to install/build/run.
}
```

### Build: run at the monorepo root, target the subpackage

`detectFramework(projectDir)` keeps operating on the subpackage's `package.json` — we still detect "this is a Next.js app", not "this is a monorepo".

But the build adapter changes its working semantics when a `MonorepoContext` is present:

| Step | Single-package (today) | Monorepo (new) |
|---|---|---|
| Install | `<pm> install --frozen` in `projectDir` | `<pm> install --frozen` in `monorepoRoot` |
| Build | `<pm> run build` in `projectDir` | `<pm> --filter <pkg> run build` (pnpm) / `<pm> run build --workspace=<pkg>` (npm/yarn) / `<pm> --filter <pkg> run build` (bun) in `monorepoRoot` |
| Build output path | `<projectDir>/<buildOutput>` | `<projectDir>/<buildOutput>` (unchanged — build runs in the subpackage's cwd via the pm's filter) |

The framework's `buildOutput`, `staticDir`, `defaultStartCommand` are all interpreted **relative to the subpackage**, same as today.

### Package: zip the monorepo, not the subpackage

`.agentuity/` is the staging dir. Two changes:

1. **Source for the zip becomes the monorepo root, not the subpackage.** `zipDir` in `cmd/cloud/deploy/upload.ts` already takes a source dir; we just pass `monorepoRoot` instead of `projectDir`.

2. **What we copy into `.agentuity/`:**
   - Whole monorepo tree (respecting `.gitignore`, `.agentuityignore`)
   - The subpackage's framework build output (e.g. `apps/web/.next/`)
   - `launch.json` at `.agentuity/launch.json` (root of deploy tree)
   - `package.json` + lockfile from the monorepo root (Hadron sees these and runs the workspace-aware install)

The current generic-adapter code that flattens / preserves framework build output keeps working — it just operates on `monorepoRoot/<subpath>/<buildOutput>` as the source and `<.agentuity>/<subpath>/<buildOutput>` as the destination.

`copyRuntimeManifests` copies the **monorepo-root** package.json + lockfile (not the subpackage's), so the runtime install resolves workspaces.

### Launch metadata

```json
{
  "processes": [{
    "type": "web",
    "default": true,
    "command": "node .next/standalone/server.js",
    "workingDirectory": "apps/web"
  }],
  "framework": { "name": "nextjs" },
  "runtime": { "name": "node" }
}
```

The `command` is the same as today — interpreted relative to `workingDirectory`. Pilot already has the `workingDirectory` field in the launch schema; if it's not wired through to the actual process spawn, that's an infra issue and gets filed.

### Runtime install (platform side)

Hadron runs install at the deploy root, which is now the monorepo root. With a workspace-aware `package.json` + lockfile, `npm ci --omit=dev`, `pnpm install --frozen-lockfile --prod`, `yarn install --immutable --production`, or `bun install --frozen-lockfile --production` all do the right thing and resolve `workspace:*` to the sibling packages in the tree.

This means **no platform changes required for happy path**, assuming pilot honors `workingDirectory`. Filed-related: agentuity/infra#356 (cross-host optional natives) still applies.

### `.agentuityignore` semantics

A `.agentuityignore` at the monorepo root applies to the whole upload. A `.agentuityignore` inside the subpackage applies relative to itself but is still respected. We follow `.gitignore` everywhere by default. We never upload `node_modules`, `.git`, or `.agentuity` regardless of ignore files.

### Edge cases & open questions

- [ ] **OQ1**: Some monorepos have their lockfile at root *and* subpackages have stale lockfiles. We use the root lockfile only. Worth a warning when a subpackage has its own lockfile (probably a mistake).
- [ ] **OQ2**: pnpm `pnpm-workspace.yaml` can declare `packages: [...]` plus per-package catalogs / `onlyBuiltDependencies`. Do we need to honor those, or does `pnpm install` at root take care of it?  *Likely the latter — the pm reads its own config.*
- [ ] **OQ3**: Build-time env: `NEXT_PUBLIC_*` and similar are read by the subpackage's build, but the user may export them in a root `.env`. We currently load env from `projectDir/.env`. Should we also load `monorepoRoot/.env` and let the subpackage override? Mirror dotenv-style cascade.
- [ ] **OQ4**: Some adapters (Next.js standalone, our `nextjsAdapter`) assume `projectDir` *is* the deploy root and write to it. They need to be taught about `MonorepoContext` so they emit paths like `apps/web/.next/standalone/...` instead of `.next/standalone/...`. Next.js standalone already does the right thing with `outputFileTracingRoot`; we may need to set that env var to the monorepo root automatically.
- [ ] **OQ5**: Upload size — naive "ship the whole monorepo" can be hundreds of MB. For now, accept it and document. Follow-up: turbo prune / pnpm deploy integration.
- [ ] **OQ6**: Pilot's launch contract — does it honor `processes[].workingDirectory`? Need to verify against the infra repo before shipping. If not, file an issue and gate behind a flag until fixed.
- [ ] **OQ7**: Project-level config (`agentuity.json`) — does it live at the subpackage or at the monorepo root? Today it sits next to the subpackage's `package.json`. Keep it there; the CLI already reads from `--dir`.
- [x] **OQ8**: `cmd/cloud/deploy/upload.ts:127` filters only top-level `node_modules/` — nested ones (`apps/web/node_modules/`) slip through and get zipped. Fix the filter to drop any segment named `node_modules` (use posix-split, not `startsWith`). Same for `.git/` (already correct), `.agentuity/` (not currently filtered).

## Milestones

- [x] **M0**: Confirmed: pilot honors `processes[].workingDirectory` for both primary and secondary processes (`services/pilot/cmd/root.go:757-758, 835-836`). Go `exec.Cmd.Dir` interprets relative paths against the parent's cwd, and pilot is launched by hadron with cwd at the bind-mounted app root (`/home/agentuity/app`), so a relative `"apps/web"` resolves correctly to `/home/agentuity/app/apps/web`.
- [x] **M1**: Detection — `detectMonorepoContext(projectDir)` in `cmd/build/detect/monorepo.ts`. 10 unit tests covering npm, pnpm, yarn, bun, nested workspaces, malformed JSON, root-deploy short-circuit.
- [x] **M2**: Build pipeline rewires when `MonorepoContext` is non-null. Install runs at the workspace root with the *workspace's* pm (not the subpackage's). Build still runs in the subpackage cwd; each pm hoists `.bin` so the build command resolves locally. The install-fallback from `f6b86050` carries through.
- [x] **M3**: Package step emits `.agentuity/` at the workspace root, mirroring the whole monorepo (every workspace package + build artifacts + root manifest + root lockfile). `copyRuntimeManifests` now also pins the lockfile to the active pm. Zip filter (`cmd/cloud/deploy/upload.ts`) drops any segment named `node_modules`, `.git`, `.agentuity`, `.ssh`, `.vite` or starting with `.env` — fixes the prior top-level-only filter.
- [x] **M4**: `processes[0].workingDirectory = monorepo.subpath` when in monorepo mode.
- [x] **Shared pipeline**: `runBuildPipeline` extracted. `agentuity build` and the deploy step both delegate; no parallel implementations.
- [x] **M5**: Next.js adapter takes a `MonorepoContext` and:
  - installs at the workspace root (so `workspace:*` resolves)
  - sets `NEXT_PRIVATE_OUTPUT_TRACE_ROOT` so the standalone bundle traces from the workspace root and packages workspace-package source
  - extends PATH with the workspace root's `node_modules/.bin` (npm/yarn hoist `next` there)
  - rebases the start command relative to `<outputDir>/<subpath>/` so `processes[].workingDirectory = monorepo.subpath` resolves correctly
  - **deploy verified**: `deploy_f50eeed94086e79bfdd59686cc122965` serves the workspace-resolved page from a Next.js monorepo.
- [x] **Zip filter / staging hygiene**: the zip filter was over-aggressive (dropped `node_modules` everywhere) and would have stripped Next.js standalone's traced `node_modules/`. Filter now only rejects truly-unsafe paths (`.git`, `.ssh`, `.DS_Store`, `.agentuity`, any `.env*`). Adapters' copy steps still skip the user's `node_modules` so the staging dir stays clean. Pinned by `test/cmd/build/staging-cleanliness.test.ts` (11 tests).
- [ ] **M6**: Smoke tests:
  - [x] npm-workspaces (Hono + `packages/shared`, runtime-resolved): `deploy_51f98243a9b86ec47731c29b3019107e`
  - [x] Next.js monorepo (Next 16 + workspace shared package, traced into standalone): `deploy_f50eeed94086e79bfdd59686cc122965`
  - [ ] pnpm-workspaces — SDK side works; deploy blocked on agentuity/infra#421 (Hadron pnpm install bypasses module proxy)
  - [ ] bun-workspaces — SDK side works; deploy blocked on agentuity/infra#423 (warmup fails with empty logs for bun workspace deploys)
- [ ] **M7**: Docs: add a "Deploying from a monorepo" section to the CLI docs / v3 architecture overview. Explain detection rules, `.agentuityignore` semantics, upload-size caveats.
- [ ] **M8**: Follow-up tracking issue for upload-size optimization (turbo prune / pnpm deploy).

## Out-of-band tasks

- Verify with infra repo (`services/pilot/cmd/root.go` etc.) that pilot reads `processes[].workingDirectory`. (OQ6 / M0)
- Once M2–M6 land, publish `3.0.0-beta.9` (also carries `f6b86050` framework-scaffold fixes).
