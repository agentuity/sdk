# Migrate Chain Test

End-to-end test exercising `v1 → v2 → v3` migrations using live
`bunx create-agentuity@<major>` scaffolds.

## Why it's gated

The suite is gated behind `MIGRATE_CHAIN_TEST=1` because it:

- hits npm (`bunx create-agentuity@<v>`) for each major version
- runs `bun install` against locally built SDK tarballs
- takes 1–3 minutes end-to-end

Without the env var the suite is **skipped**, so `bun test` at the package
level stays fast.

## Running locally

```bash
# Build and pack the SDK (idempotent — reuses existing tarballs)
bash scripts/prepare-sdk-for-testing.sh

# Run the chain suite
MIGRATE_CHAIN_TEST=1 bun test packages/migrate/test/chain/
```

The test:

1. Scaffolds a fresh v1 project via `bunx create-agentuity@<latest-v1>`
2. Runs `agentuity-migrate --v1-to-v2` against it
3. Runs `agentuity-migrate --v2-to-v3` against it
4. Rewrites `@agentuity/*` deps to point at local tarballs
5. Runs `bun install` + `bunx tsc --noEmit` — expects both to pass

Step 5 is the catch-all: if any earlier transform leaves broken TypeScript
or unresolvable deps, the test fails with the raw `tsc` / `bun install`
output so you can iterate against concrete errors.

## Version selection

Each run resolves the **latest published version** on the 1.x and 2.x
major lines via `bun pm view create-agentuity versions --json`. This
matches what real users get from `bun create agentuity@1` today and
lets the test track upstream changes automatically.
