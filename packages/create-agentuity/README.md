# create-agentuity

Scaffold a new Agentuity project with one command. This package is a thin
launcher that delegates to `@agentuity/cli`'s `project create` flow.

## Usage

```bash
bun create agentuity my-project
cd my-project
bun run dev
```

Or with npm:

```bash
npm create agentuity@latest my-project
```

## What you get

`agentuity project create` scaffolds a project using the official CLI for the
framework you pick (Next.js, Nuxt, SvelteKit, Astro, or Hono) and overlays:

- **AI translation demo** — a working `/translate` endpoint plus landing page
  using `@agentuity/aigateway`.
- **Agentuity wiring** — `@agentuity/cli` as a devDependency, a `deploy`
  script, the Agentuity badge on the landing page, and `.gitignore` entries.
- **Optional service augments** — a multi-select prompts you to add any of
  DB (Postgres + Drizzle), KeyValue, Queue, Vector, or Storage. Each
  augment composes into the translate demo so you see the service working
  in context (e.g. cached translations, history panel, similar-translation
  search) instead of a separate playground page.

The output project is plain framework code — no Agentuity runtime imports,
no `createApp()`, no agent registry. You bring the framework, Agentuity
provides the deploy pipeline and service clients.

## Available scripts in the generated project

The exact scripts depend on the framework you pick (the official CLI's own
defaults are preserved). Every project gets at least:

```bash
bun run dev          # Run the framework's dev server with Agentuity env wiring
bun run build        # Framework build
agentuity deploy     # Deploy to Agentuity Cloud
```

## Requirements

- [Bun](https://bun.sh/) 1.3+ or Node.js 24+
- An [Agentuity](https://agentuity.com) account (sign in via `agentuity login`
  before running `agentuity deploy`)

## See also

- [`@agentuity/cli`](https://www.npmjs.com/package/@agentuity/cli) — the underlying CLI
- [Agentuity docs](https://agentuity.dev)

## License

Apache 2.0
