---
name: agentuity-canary
description: Upgrade an Agentuity app project to SDK canary tarballs published from an agentuity/sdk PR. Use when testing a SDK PR before merge, pinning all @agentuity/* packages to the same prerelease build, or preparing a project like basic-agent for canary webhook deploy validation.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Canary Upgrades

SDK PRs publish matching `@agentuity/*` tarballs to Tigris. Every Agentuity package in the graph must share the **same canary version** or installs and builds fail in confusing ways.

## When To Use

- A SDK PR has the `<!-- agentuity-canary-bot -->` comment with tarball URLs
- You need to validate a SDK change in a real app (for example `agentuity/basic-agent`) before merge
- Webhook/CI builds must pick up a prerelease CLI change (paired with infra-side env like `GITHUB_ARCHIVE_TOKEN`)

## Quick Path

From the SDK repo:

```bash
# By PR number (reads the canary bot comment)
bun scripts/upgrade-canary.ts --pr 1552 ../basic-agent

# Or by explicit canary version
bun scripts/upgrade-canary.ts --version 2.0.26-2956070 ../basic-agent
```

Then in the target project:

```bash
bun run typecheck
bun run build
git add package.json bun.lock
git commit -m "chore: pin Agentuity packages to SDK canary <version>"
git push
```

Push triggers the linked project's GitHub webhook deploy when auto-deploy is enabled.

## What The Script Does

1. Fetches `https://agentuity-sdk-objects.t3.storageapi.dev/npm/<version>/manifest.json`
2. Rewrites every direct `@agentuity/*` entry in `dependencies` and `devDependencies` to tarball URLs
3. Sets `overrides` for **all** packages in the manifest so transitive `@agentuity/*` deps stay on the same canary
4. Runs `bun install`

Always commit **both** `package.json` and `bun.lock`.

## Rules

- **Bun only** — never use npm/pnpm for Agentuity projects
- **All `@agentuity/*` together** — do not pin only `@agentuity/cli` or only `@agentuity/runtime`; overrides exist because the graph is tightly coupled
- **Use tarball URLs, not semver** — canary builds are not on npm `latest`
- **Match the PR branch line** — v2 PRs publish `2.0.x-<sha>` canaries; main publishes `3.0.x-<sha>`

## Find The Canary Version

On the SDK PR, expand the bot comment **Packages** / **Install** section, or read:

```bash
curl -s "https://agentuity-sdk-objects.t3.storageapi.dev/npm/<version>/manifest.json" | jq .
```

## Dry Run

```bash
bun scripts/upgrade-canary.ts --pr 1552 ../basic-agent --dry-run
```

## Revert To npm

Restore direct deps to `latest` (or a released semver), remove `overrides`, run `bun install`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Mixed `@agentuity/*` versions in `bun.lock` | Missing or incomplete `overrides` — rerun the script |
| `Cannot find module '@agentuity/...'` after install | Canary expired (7-day TTL) or wrong version string |
| Build ok locally, webhook deploy fails | Sandbox snapshot CLI not on canary — infra uses build snapshot / `VERSION=`, not app `package.json` |
| 404 downloading GitHub source in webhook build | Infra passes `GITHUB_ARCHIVE_TOKEN` but sandbox CLI too old — need canary CLI in build snapshot or SDK fix merged |

## Related

- SDK canary publish workflow: `.github/workflows/canary.yaml`
- Pack/upload script: `scripts/canary.ts`
- Upgrade script: `scripts/upgrade-canary.ts`
