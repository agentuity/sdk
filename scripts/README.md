# SDK Testing Scripts

**Production-like testing with packaged tarballs** - These scripts ensure we test exactly what end users will install from npm, not workspace symlinks.

## Quick Start

Run the full CI test suite locally:

```bash
# Run all CI tests (integration + e2e, optimized - builds once)
bun run test:ci

# Run all tests including cloud (needs credentials)
bun run test:ci:all

# Or run individual test suites (each builds+packs separately)
bun run test:ci:integration  # Integration suite only
bun run test:ci:cloud        # Cloud deployment only
bun run test:ci:e2e          # E2E web tests only
```

**Optimized workflow** (faster - prepare once, test many):

```bash
# 1. Prepare SDK once
bun run test:ci:prepare

# 2. Run tests (reuses prepared SDK)
bash scripts/run-integration-tests.sh
bash scripts/run-cloud-tests.sh
bash scripts/run-e2e-tests.sh
```

These commands run **exactly** what CI runs - same scripts, same steps. Use them to reproduce CI failures locally.

## The Problem

In a monorepo, `workspace:*` dependencies create symlinks that work locally but don't reflect the real npm package experience. Bun.build can have resolution issues with symlinks, especially in CI. Users install **real packages**, so we must test with **real packages**.

## The Solution

**Build once, pack once, test many times** with production-like tarballs.

All scripts are **dynamic** - they auto-discover packages in `packages/` directory, so adding new packages requires no script changes.

## Scripts Overview

### Core Build Scripts

**`build-sdk.sh`** - Build all SDK packages once

```bash
bash scripts/build-sdk.sh
```

- Auto-discovers all packages in `packages/` directory
- Runs `bun run build` at monorepo root
- Verifies all packages have `dist/` folders
- Idempotent - safe to run multiple times
- **Dynamic** - no changes needed when adding new packages

**`pack-sdk.sh`** - Pack SDK packages as tarballs

```bash
bash scripts/pack-sdk.sh
```

- Auto-discovers all packages in `packages/` directory
- Creates `dist/packages/` with `*.tgz` files
- Validates packages are built first
- Uses `npm pack` (works with Bun workspaces)
- **Dynamic** - automatically packs all discovered packages

**`install-sdk-tarballs.sh`** - Install tarballs in a test app

```bash
bash scripts/install-sdk-tarballs.sh apps/testing/integration-suite
```

- Installs SDK packages from `dist/packages/` into test app
- Removes existing `@agentuity` packages first (clean install)
- Verifies installation succeeded

### Preparation Scripts

**`prepare-sdk-for-testing.sh`** - One-time setup for all tests

```bash
bash scripts/prepare-sdk-for-testing.sh
# Or: bun run test:ci:prepare
```

1. Build all SDK packages
2. Pack as tarballs

Run this once, then run multiple test suites without re-building.

### Lightweight Test Runners (Expect Pre-Prepared SDK)

These scripts expect tarballs to already exist (run `prepare-sdk-for-testing.sh` first):

**`run-integration-tests.sh`** - Run integration suite only

```bash
bash scripts/run-integration-tests.sh
```

- Validates tarballs exist
- Installs in integration-suite
- Runs tests

**`run-cloud-tests.sh`** - Run cloud tests only

```bash
bash scripts/run-cloud-tests.sh
```

- Validates tarballs exist
- Installs in cloud-deployment
- Runs tests

**`run-e2e-tests.sh`** - Run E2E tests only

```bash
bash scripts/run-e2e-tests.sh
```

- Validates tarballs exist
- Installs in e2e-web
- Builds e2e-web app
- Runs Playwright tests

### Full CI Test Runners (Standalone)

These scripts run the **complete CI workflow** - build, pack, install, test.  
Use these for one-off testing when you haven't prepared the SDK yet:

**`test-integration-suite.sh`** - Integration suite full CI flow

```bash
bash scripts/test-integration-suite.sh
# Or: bun run test:ci:integration
```

1. Build SDK packages
2. Pack as tarballs
3. Install in integration-suite
4. Run integration tests

**`test-cloud-deployment.sh`** - Cloud deployment full CI flow

```bash
bash scripts/test-cloud-deployment.sh
# Or: bun run test:ci:cloud
```

1. Build SDK packages
2. Pack as tarballs
3. Install in cloud-deployment
4. Run cloud deployment tests

**`test-e2e.sh`** - E2E web tests full CI flow

```bash
bash scripts/test-e2e.sh
# Or: bun run test:ci:e2e
```

1. Build SDK packages
2. Pack as tarballs
3. Install in e2e-web
4. Build e2e-web app
5. Run Playwright tests

## Local Development Workflow

### Option 1: Fast Dev (Workspace Protocol)

For rapid iteration during development:

```bash
# Normal workspace development
cd apps/testing/integration-suite
bun install  # Uses workspace:*
bun run build
bun run test
```

**Pros:** Fast, hot-reload  
**Cons:** Not production-like

### Option 2: Production-Like Testing (Recommended for Pre-PR)

Test exactly as CI will test (and as users will experience):

```bash
# Run full CI workflow for all test suites
bun run test:ci

# Or run individual test suites
bun run test:ci:integration  # Integration suite
bun run test:ci:cloud        # Cloud deployment
bun run test:ci:e2e          # E2E web tests
```

**Pros:** True production parity, catches packaging bugs, reproducible CI failures  
**Cons:** Slower (full build + pack + install cycle)

### Option 3: Manual Step-by-Step (Advanced Debugging)

For debugging specific steps:

```bash
# 1. Build SDK packages
bash scripts/build-sdk.sh

# 2. Pack as tarballs
bash scripts/pack-sdk.sh

# 3. Install in test app
bash scripts/install-sdk-tarballs.sh apps/testing/integration-suite

# 4. Run tests manually
cd apps/testing/integration-suite
bash scripts/ci-test.sh
```

## CI Workflow

CI uses production-like testing exclusively. Each test suite follows the same pattern:

```yaml
# .github/workflows/package-smoke-test.yaml
integration-test:
   steps:
      - name: Install dependencies
        run: bun install

      - name: Build SDK packages
        run: bash scripts/build-sdk.sh

      - name: Pack SDK packages
        run: bash scripts/pack-sdk.sh

      - name: Install SDK in integration-suite
        run: bash scripts/install-sdk-tarballs.sh apps/testing/integration-suite

      - name: Setup test credentials
        run: # ... env vars (API keys, secrets)

      - name: Run integration test suite
        run: bash apps/testing/integration-suite/scripts/ci-test.sh
```

**Key differences from local:**

- CI has additional env vars (API keys, secrets)
- Otherwise **identical** - same scripts, same commands

**Reproduce locally:**

```bash
# Exact same flow as CI (minus env vars)
bun run test:ci:integration
```

## Benefits

✅ **Production parity** - Test with real npm packages  
✅ **Catches packaging bugs** - Missing files, broken exports  
✅ **No workspace magic** - No symlink resolution issues  
✅ **Reproducible** - Same scripts locally and in CI  
✅ **Fast** - Build once, pack once, reuse everywhere  
✅ **Clear** - One script per step, easy to debug

## Troubleshooting

**Error: "SDK packages not installed"**

```bash
# Solution: Install tarballs first
bash scripts/pack-sdk.sh
bash scripts/install-sdk-tarballs.sh apps/testing/integration-suite
```

**Error: "No tarballs found"**

```bash
# Solution: Build and pack first
bash scripts/build-sdk.sh
bash scripts/pack-sdk.sh
```

**Error: "Package @agentuity/X is not built"**

```bash
# Solution: Build packages first
bash scripts/build-sdk.sh
```

## Adding New Packages

All scripts are **dynamic** and auto-discover packages. No script changes needed!

```bash
# 1. Create new package
mkdir packages/my-new-package
cd packages/my-new-package
# ... create package.json, src/, etc.

# 2. Build as usual
cd ../..
bash scripts/build-sdk.sh  # Automatically discovers my-new-package

# 3. Pack as usual
bash scripts/pack-sdk.sh   # Automatically packs my-new-package

# 4. Test
bun run test:ci:integration
```

The scripts automatically discover all directories in `packages/` that contain a `package.json` file.

## Migration Notes

### Old Way (Removed)

```bash
# ❌ OLD: Hardcoded package lists
PACKAGES=("core" "schema" "frontend" ...)  # Required updates

# ❌ OLD: Workspace symlink workarounds
bash scripts/ci-link-workspace.sh
```

This approach was brittle (breaks when adding packages) and used symlink workarounds that didn't test production experience.

### New Way

```bash
# ✅ NEW: Dynamic package discovery
for pkg_dir in packages/*; do
  if [ -f "$pkg_dir/package.json" ]; then
    # Auto-discovered!
  fi
done

# ✅ NEW: Production-like tarballs
bun run test:ci  # One command for full CI flow
```

Test with real packages, not symlinks. Reliable in both local and CI. No manual updates needed when adding packages.
