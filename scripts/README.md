# SDK Testing Scripts

**Production-like testing with packaged tarballs** — these scripts ensure we
test exactly what end users will install from npm, not workspace symlinks.

## Test tree

All test apps live under `tests/` at the repo root:

```
tests/
   frameworks/              # full framework demos (Playwright)
      tanstack-start/
      nextjs-app/
      svelte-web/
   services/                # per-service client smoke tests
      db/ email/ keyvalue/ vector/ queue/
      sandbox/ schedule/ task/ webhook/
   integration/             # app-level integration targets
      e2e-web/
      integration-suite/
      oauth/
      standalone-backend/
```

## Quick Start

```bash
# Framework demos (tanstack / nextjs / svelte via agentuity dev + Playwright)
bun run test:frameworks

# Per-service client smoke (needs AGENTUITY_SDK_KEY)
bun run test:services

# Individual service
bun run test:services:keyvalue
bun run test:services:queue

# CLI command tests (sandbox, queue) — exercise the CLI against live cloud
bash scripts/test-sandbox.sh
bash scripts/test-queue.sh

# Dev smoke for framework apps (checks `agentuity dev` starts them)
bun run test:dev
```

## Scripts

### Core build/pack (for production-like testing)

- **`build-sdk.sh`** — Build all SDK packages once. Idempotent.
- **`pack-sdk.sh`** — Pack SDK packages as `*.tgz` tarballs in `dist/packages/`.
- **`install-sdk-tarballs.sh <app-dir>`** — Install tarballs into a test app
  (replaces `workspace:*` symlinks with real npm-style installs).
- **`prepare-sdk-for-testing.sh`** — Convenience: build + pack in one go.

All scripts are **dynamic** — they auto-discover packages in `packages/`, so
adding a new package requires no script changes.

### Framework + dev smoke

- **`test-framework-demos.sh`** — Playwright e2e against tanstack / nextjs /
  svelte via `agentuity dev`. Supports `--tanstack-only`, `--nextjs-only`,
  `--svelte-only`, `--skip-build`.
- **`test-dev.sh`** — Starts each framework app under `agentuity dev` and
  verifies it responds on port 3000. Exercises framework detection and
  AI-Gateway env injection.

### Service CLI tests (CI)

- **`test-queue.sh`** — Exercises `agentuity cloud queue …` against live cloud.
- **`test-sandbox.sh`** — Exercises `agentuity cloud sandbox …` against live
  cloud.

### Install verification

- **`test-package-install.sh`** — Install all published packages into a
  scratch project and verify imports work.
- **`test-install.sh`** / **`test-bun-check.sh`** — Used by the
  `.github/workflows/test-install.yaml` pipeline.

### Utilities

- **`canary.ts`**, **`publish.ts`**, **`generate-release-data.sh`** — release
  tooling.
- **`check-legacy-cli.ts`**, **`link-local.sh`**, **`generate-snapshot-schema.ts`**
  — dev helpers.

## CI Workflow

See `.github/workflows/package-smoke-test.yaml`. Jobs:

| Job | Script | What it runs |
|---|---|---|
| `smoke-test` | `test-package-install.sh` | Package install sanity |
| `postgres-ssl-test` | `packages/postgres/test-postgres.sh` | Postgres resilience |
| `installation-type-test` | `packages/cli/scripts/test-installation-type.sh` | CLI install detection |
| `testing-apps-test` | direct `bun test` | Integration app + framework structure tests |
| `sandbox-cli-test` | `test-sandbox.sh` | CLI sandbox commands vs cloud |
| `queue-cli-test` | `test-queue.sh` | CLI queue commands vs cloud |
| `service-client-test` | `test:services:*` | Service client packages vs cloud |
| `framework-demo-test` | `test-framework-demos.sh` | Playwright e2e vs framework demos |

## Benefits of the tarball flow

✅ **Production parity** — test with real npm packages
✅ **Catches packaging bugs** — missing files, broken exports
✅ **No workspace magic** — no symlink resolution issues
✅ **Reproducible** — same scripts locally and in CI

## Adding a New Package

All scripts auto-discover packages in `packages/`. No script changes needed.
