---
name: agentuity-project
description: >-
  Use when creating, importing, running, building, or deploying an Agentuity app.
  Covers framework-first project structure, agentuity.json, .env setup,
  agentuity dev, agentuity build, agentuity deploy, monorepo --dir usage, and
  deployment bundle inspection.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Project Lifecycle

Agentuity deploys framework apps as they are. Keep the framework's routing,
pages, server functions, and config in their normal locations. Agentuity adds
project metadata, local environment wiring, build packaging, deployment, and
managed services.

## Choose Create or Import

Use `agentuity create` for a new app:

```bash
agentuity create --name my-app --framework nextjs
```

Use `agentuity project import` for an existing framework app:

```bash
agentuity project import --name my-app --confirm
```

For monorepos, run commands from the app package or pass `--dir`:

```bash
agentuity project import --dir apps/web --name web --confirm
agentuity deploy --dir apps/web
```

## What Agentuity Adds

After create/import, expect these files next to the app's `package.json`:

| File | Purpose |
|---|---|
| `agentuity.json` | Project, org, region, and deployment metadata |
| `.env` | Local SDK key and linked resource values |
| `.agentuity/launch.json` | Build output contract produced by `agentuity build` |

The framework still owns `dev`, `build`, and route files. Agentuity adds deploy tooling and cloud resource wiring.

## Development Loop

Use the framework's normal dev command for everyday framework work. Run through
Agentuity when you want the CLI to inject linked project credentials, expose the
Agentuity tunnel, or validate the deployed-like environment:

```bash
agentuity dev
```

Read the terminal output for the actual local URL and tunnel URL. Do not invent
localhost ports or public deployment URLs.

## Build and Deploy

Build locally when you need to inspect packaging:

```bash
agentuity build
```

Check `.agentuity/launch.json` after a build. It describes the process Agentuity will start after deployment.

Deploy from a linked project:

```bash
agentuity deploy
```

For multiple environments (same code, different cloud projects):

```bash
agentuity deploy \
  --project-config agentuity.staging.json \
  --env .env \
  --env .env.staging
```

`--project-config` selects the project metadata file (default `agentuity.json`).
Global `--env` loads env files in order; later files override earlier keys.

The deploy flow syncs non-Agentuity env values, builds the app, packages the
bundle, uploads assets, provisions the deployment, and prints the deployment ID
plus URLs.

## Existing App Checklist

Before deploying an existing app:

1. Run `agentuity project import --validate-only`.
2. Fix any reported framework, package, or build issues.
3. Run `agentuity project import --name <name> --confirm`.
4. Run `agentuity build`.
5. Inspect `.agentuity/launch.json`.
6. Run `agentuity deploy`.

## Working With Services

When adding Agentuity services to app code, import standalone clients in the server-side module that owns the work:

```typescript
import { KeyValueClient } from '@agentuity/keyvalue';

const kv = new KeyValueClient();

export async function saveDraft(userId: string, draft: string): Promise<void> {
  await kv.set('drafts', userId, { draft }, { ttl: 60 * 60 * 24 });
}
```

For service selection and client examples, use the `agentuity-services` skill.
For terminal management of resources, use the `agentuity-cloud` skill.

## Common Mistakes

| Mistake | Better approach |
|---|---|
| Moving framework files into Agentuity-owned folders | Keep route and page files where the framework expects them |
| Creating project metadata by hand | Use `agentuity create` or `agentuity project import` |
| Treating `agentuity dev` as mandatory | Use it only for CLI env wiring, tunnel output, or deploy-like validation |
| Guessing deployment URLs | Read `agentuity deploy` output or inspect deployments with the CLI |
| Importing from the repo root in a monorepo | Run from the app package or use `--dir` |

## Useful Docs

- Project structure: https://agentuity.dev/get-started/project-structure
- Import existing app: https://agentuity.dev/get-started/import-existing-app
- Deployment: https://agentuity.dev/reference/cli/deployment
- Build configuration: https://agentuity.dev/reference/cli/build-configuration
