# Storage Test App

A small standalone app that exercises `@agentuity/storage` end-to-end
against a real bucket. Runs under both **Bun** and **Node** so we can
verify that the dual-runtime backend selection works in practice.

## Usage

### 1. Get bucket credentials

Pick (or create) a bucket and grab its credentials:

```bash
agentuity cloud storage list --show-credentials
```

### 2. Set environment variables

```bash
export AGENTUITY_STORAGE_ENDPOINT="my-bucket.agentuity.run"
export AGENTUITY_STORAGE_ACCESS_KEY="..."
export AGENTUITY_STORAGE_SECRET_KEY="..."
# Optional. Defaults to "auto".
export AGENTUITY_STORAGE_REGION="us-east-1"
```

### 3. Run

Under Bun (uses the `Bun.S3Client` backend automatically):

```bash
bun install
bun run start:bun
```

Under Node 24+ (uses the `@aws-sdk/client-s3` backend automatically):

```bash
bun install
bun run start:node
```

Both runs do the same operations against the same bucket. If both
succeed and report identical sizes / content, the dual-runtime contract
is holding.

## What it does

The script uploads a small text object, lists it, stats it, downloads
it and verifies the content round-trips, then deletes it. Each step
prints which backend it's using (Bun vs. Node) so you can see at a
glance which path was taken.

A test run touches a single ephemeral key prefixed with
`storage-test/<timestamp>-`. The prefix is wiped at the end of the run
even if a step fails (best-effort cleanup).

## Notes

- The Node script uses Node's native TypeScript stripping
  (`--experimental-strip-types`), so no `tsx` / `ts-node` is required.
  Node 24.0+ supports this; older Node versions are not supported.
- The Bun script uses Bun's built-in TypeScript runner.
- The script prints `Runtime: bun` or `Runtime: node` at startup so a
  failed log makes it obvious which backend was exercised.
