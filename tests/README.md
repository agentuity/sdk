# `tests/`

Test apps and fixtures live here, grouped by purpose.

```
tests/
├── frameworks/     # full framework demos (Playwright e2e + agentuity dev)
│   ├── tanstack-start/
│   ├── nextjs-app/
│   └── svelte-web/
├── services/       # per-service client smoke tests (one @agentuity/<svc> each)
│   ├── db/
│   ├── email/
│   ├── keyvalue/
│   ├── queue/
│   ├── sandbox/
│   ├── schedule/
│   ├── task/
│   ├── vector/
│   └── webhook/
└── integration/    # app-level integration targets
    ├── e2e-web/
    ├── integration-suite/
    ├── oauth/
    └── standalone-backend/
```

## `frameworks/`

End-to-end framework demos exercising the build + deploy pipeline and the
`agentuity dev` passthrough. Each app:

- Uses the framework's own CLI idioms (Next App Router / TanStack Start /
  SvelteKit) — no Agentuity templates.
- Runs through `agentuity dev`, which injects `OPENAI_API_KEY` and
  `OPENAI_BASE_URL` (AI Gateway).
- Has a translation demo at `/` + `/about` page + `/api/translate` endpoint.
- Ships `tests/structure.test.ts` (bun:test) verifying project layout, and
  `tests/e2e.pw.ts` (Playwright) verifying behaviour.

Playwright config: `playwright.frameworks.config.ts` at repo root. Runner:
`scripts/test-framework-demos.sh`. CI job: `framework-demo-test`.

## `services/`

One standalone Bun app per service client package. Each imports the real
client (e.g. `@agentuity/keyvalue`) and exercises it against the live
cloud — create / read / delete round-trips. Requires `AGENTUITY_SDK_KEY`.

Run locally:

```bash
bun run test:services             # all services sequentially
bun run test:services:keyvalue    # single service
```

CI job: `service-client-test` in `.github/workflows/package-smoke-test.yaml`.

## `integration/`

App-level integration targets — Hono/Bun backends used for integration
testing. These get `bun test` unit coverage via CI (`testing-apps-test`
job):

- **`e2e-web`** — minimal Hono server used as a target for future browser
  e2e tests (see memory #108 for the planned rebuild).
- **`integration-suite`** — stub Hono app that will eventually wrap every
  service client behind HTTP routes (see TODO: placeholders inside).
- **`oauth`** — OAuth 2.0 flow integration test.
- **`standalone-backend`** — standalone Bun backend, exercises core
  server patterns.

## Scripts in this tree

`tests/package.json` provides convenience scripts:

```bash
cd tests
bun run typecheck:all    # all framework apps + integration-suite
bun run build:tanstack   # one app
bun run test:frameworks  # delegates to scripts/test-framework-demos.sh
```
