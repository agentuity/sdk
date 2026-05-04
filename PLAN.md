# Service Augments for Framework Scaffolding

## Goal

After `agentuity project create` scaffolds a framework + the AI translation demo, offer a multi-select to add service augments. Each augment integrates into the existing translate page — adding cache lookup, history, similar-translation search, etc. — so the user sees the services working *as part of the demo they already have*, not as separate pages.

The output project must look hand-written: no commented-out code, no feature flags, no dead imports for unselected services.

## Services in scope

| Service | Packages | Role in the augmented translate demo |
|---|---|---|
| **DB** | `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless` | Cache translations in PostgreSQL. Show translation history below the form. |
| **KeyValue** | `@agentuity/keyvalue` | Persist last language/model. Loaded on mount, saved on each result. |
| **Queue** | `@agentuity/queue` | "Translate later" — enqueue a job and show a small "queued jobs" panel. |
| **Storage** | `@agentuity/storage` | Export the translation history (from DB) as a downloadable file. |
| **Vector** | `@agentuity/vector` | Upsert each translation; show "similar past translations" panel under the result. |

Excluded: email, task, schedule, webhook.

## Composition strategy: insertion-point comment markers

### The mechanism

Each composable file in the base template contains marker comments on their own lines:

```ts
// @agentuity:imports
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
// @agentuity:module

export interface TranslateInput { text: string; toLanguage: string; model: string; }
export interface TranslateResult {
  translation: string; tokens: number; model: string; toLanguage: string;
}

export async function translate(input: TranslateInput): Promise<TranslateResult> {
  // @agentuity:translate-pre

  const { text: translation, usage } = await generateText({
    model: openai(input.model),
    prompt: `Translate the following text to ${input.toLanguage}. Return only the translation, nothing else.\n\n${input.text}`,
  });

  const result: TranslateResult = {
    translation,
    tokens: usage?.totalTokens ?? 0,
    model: input.model,
    toLanguage: input.toLanguage,
  };

  // @agentuity:translate-post

  return result;
}
```

A service contributes a snippet for any marker it cares about. At scaffold time:

1. Read each composable file from the base.
2. For each marker comment line, look up snippets contributed by selected services.
3. Concatenate snippets in catalog-defined service order at that point.
4. Strip the marker line itself.
5. Write the file out.

### Rules

- Markers are **single-line insertion points**, not paired open/close.
- A marker line is removed from output regardless of whether anyone contributed.
- A service contributing nothing for a marker contributes nothing — empty is fine.
- Snippets are concatenated with a single blank line between contributions.
- **Service order is fixed by the catalog**, not by user selection order.
- Marker comment syntax depends on the file region — declared per-marker in the framework manifest (see below). Either `//` (JS/TS, frontmatter, scripts) or `<!-- -->` (HTML body, template regions in Svelte/Vue/Astro).

### Non-goals for markers

- **No conditionals** (`@if db`).
- **No paired open/close regions** for replacement.
- **No inline substitution** (e.g., changing `useState('Spanish')` to `useState(prefs.lang ?? 'Spanish')`). Services that want to influence initial state load it via fetch-on-mount and apply it in an effect. The KV preferences feature is the only known case; it accepts this.
- **Whole files are not marker-composed.** Drizzle config, schemas, dedicated routes (`/api/jobs`, `/api/export`, etc.) are plain copies, owned by one service.

## Marker catalog

### Server-side — `translate.ts` helper (4 markers)

| marker | purpose |
|---|---|
| `imports` | Module imports (drizzle, vector client, etc.) |
| `module` | Module-scope declarations (e.g. `const vector = new VectorClient()`). Sits between imports and the `translate()` function. |
| `translate-pre` | Inside `translate()`, before the AI call. Can early-return (DB cache hit). |
| `translate-post` | Inside `translate()`, after the AI call, before the return. Mutate or augment `result`, fire side effects (DB insert, Vector upsert). |

### View-side — page/landing file (7 markers)

| marker | purpose |
|---|---|
| `imports` | Component imports |
| `state` | New component state declarations (`useState`, `$state`, `ref`, `let` in frontmatter) |
| `on-mount` | Hooks/effects that run once on mount (load preferences, fetch history) |
| `on-result` | Hooks/effects (or imperative code) that run when a translation completes (save preferences, refetch history, fetch similar) |
| `inside-form-buttons` | Buttons rendered inside the form's button row, alongside Translate (e.g., Queue later) |
| `after-result` | UI rendered immediately after the result block (cache badge, similar panel) |
| `after-form` | UI rendered after the entire translate form (history panel, queued-jobs panel, export button) |

11 markers total. Same names everywhere; per-framework manifest declares which file each marker lives in and what comment syntax to use.

## Per-framework layout

| Framework | helper file | route/action file (thin wrapper) | view file(s) |
|---|---|---|---|
| **nextjs** | `src/lib/translate.ts` | `src/app/api/translate/route.ts` | `src/app/page.tsx` |
| **remix** | `app/lib/translate.ts` | `app/routes/api.translate.ts` | `app/routes/home.tsx` |
| **vite-react** | `server/translate.ts` | `server.ts` (delegates) | `src/App.tsx` |
| **nuxt** | `server/utils/translate.ts` | `server/api/translate.post.ts` | `app.vue` |
| **sveltekit** | `src/lib/server/translate.ts` | `src/routes/+page.server.ts` | `src/routes/+page.svelte` |
| **astro** | `src/lib/translate.ts` | `src/pages/api/translate.ts` | `src/pages/index.astro` |
| **hono** | `src/translate.ts` | `src/index.ts` | `src/landing.html` |

### Per-framework marker placement

#### nextjs
- `translate.ts`: standard 4 markers, `//`.
- `page.tsx`: `imports` (`//`), `state` (`//`, inside `Home()`), `on-mount` (`//`), `on-result` (`//`), `inside-form-buttons` (`{/* */}`), `after-result` (`{/* */}`), `after-form` (`{/* */}`).

#### remix
Same as nextjs.

#### vite-react
- `server/translate.ts`: standard 4 markers, `//`.
- `server.ts`: NOT composed — its translate branch becomes `const result = await translate(input); return Response.json(result);`.
- `App.tsx`: same as nextjs `page.tsx`.

#### nuxt
- `server/utils/translate.ts`: standard 4 markers, `//`.
- `app.vue`:
  - `imports` (`//`, in `<script setup>`)
  - `state` (`//`, in `<script setup>`)
  - `on-mount` (`//`, in `<script setup>` near `onMounted` if present, or service contributes the `onMounted(...)` itself)
  - `on-result` (`//`, in `<script setup>` — service contributes a `watch(result, ...)` block)
  - `inside-form-buttons` (`<!-- -->`, in `<template>`)
  - `after-result` (`<!-- -->`, in `<template>`)
  - `after-form` (`<!-- -->`, in `<template>`)

#### sveltekit
- `src/lib/server/translate.ts`: standard 4 markers, `//`.
- `+page.svelte`:
  - `imports` (`//`, in `<script lang="ts">`)
  - `state` (`//`, in `<script>`)
  - `on-mount` (`//`, in `<script>`, service uses `onMount(...)` from svelte)
  - `on-result` (`//`, in `<script>`, service uses `$effect(() => { if (form?.translation) {...} })`)
  - `inside-form-buttons` (`<!-- -->`, in template)
  - `after-result` (`<!-- -->`, in template)
  - `after-form` (`<!-- -->`, in template)

#### astro
- `src/lib/translate.ts`: standard 4 markers, `//`.
- `src/pages/index.astro`: three regions in one file.
  - **frontmatter** (between `---` fences): `imports` (`//`), `state` (`//`)
  - **HTML body**: `inside-form-buttons` (`<!-- -->`), `after-result` (`<!-- -->`), `after-form` (`<!-- -->`)
  - **bottom `<script>`**: `on-mount` (`//`), `on-result` (`//`)

#### hono
- `src/translate.ts`: standard 4 markers, `//`.
- `src/index.ts`: NOT composed — becomes a thin wrapper that imports `translate()` and reads `landing.html`.
- `src/landing.html`: new file, contains the HTML body and the inline `<script>`. Markers:
  - `imports`, `state`, `on-mount`, `on-result` go in the inline `<script>` (`//`)
  - `inside-form-buttons`, `after-result`, `after-form` go in HTML (`<!-- -->`)

### One-time base refactor (M1 + M2)

Each framework's base needs three changes before service work begins:

1. **Extract `translate()` helper** into the file path above. The helper has the standard markers.
2. **Replace the route/action body** with a thin wrapper calling `translate()`.
3. **Add the 7 page-side markers** at the right positions in the view file.

Hono additionally needs:

4. **Move the HTML out of the `c.html(\`...\`)` template literal** into `src/landing.html`. `src/index.ts` reads it via `Bun.file('./src/landing.html').text()` (or equivalent). This unlocks marker composition in the view.

Vite+React additionally needs:

4. **Extract the `/api/translate` branch logic into `server/translate.ts`**. The `server.ts` file remains the entry point (it owns Bun.serve + the Vite proxy + routing) but its translate branch is one line.

These refactors are pure improvements regardless of services — they tighten the base.

## Service catalog

`packages/cli/src/cmd/project/services-catalog.ts`:

```ts
export interface ServiceAugment {
  id: 'db' | 'keyvalue' | 'queue' | 'storage' | 'vector';
  label: string;
  hint: string;
  description: string;
  order: number;                            // fixed snippet concatenation order
  requires?: ServiceAugment['id'][];
  packages: string[];
  devPackages?: string[];
  scripts?: Record<string, string>;
  envVars?: Array<{ name: string; placeholder: string; comment?: string }>;
  frameworks: Array<'nextjs'|'remix'|'vite-react'|'nuxt'|'sveltekit'|'astro'|'hono'>;
}
```

Initial catalog (chosen so dependencies come first):

| order | id | requires | notes |
|---|---|---|---|
| 10 | `keyvalue` | — | runs first; affects `on-mount` and `on-result` |
| 20 | `db` | — | introduces history; affects most page markers |
| 30 | `vector` | — | runs after AI; doesn't depend on DB |
| 40 | `queue` | — | adds form button + jobs panel |
| 50 | `storage` | db | exports DB history |

Storage's `requires: ['db']` is enforced by the prompt: selecting Storage forces DB on (with a confirmation message).

## On-disk layout

```
packages/cli/src/cmd/project/
├── frameworks.ts                 # existing
├── scaffold.ts                   # existing — gains the composer step
├── services-catalog.ts           # NEW
├── services-composer.ts          # NEW
├── templates/
│   ├── nextjs/
│   │   ├── manifest.json         # NEW: composableFiles + per-marker syntax
│   │   └── ... (refactored base)
│   ├── nuxt/
│   ├── remix/
│   ├── sveltekit/
│   ├── astro/
│   ├── hono/
│   ├── vite-react/
│   └── services/
│       ├── db/
│       │   ├── manifest.json     # service catalog entry
│       │   ├── files/
│       │   │   ├── nextjs/
│       │   │   │   ├── src/db/schema.ts
│       │   │   │   ├── src/db/index.ts
│       │   │   │   ├── drizzle.config.ts
│       │   │   │   └── src/app/api/history/route.ts
│       │   │   └── ... (one subdir per framework, may be omitted if N/A)
│       │   └── snippets/
│       │       ├── nextjs/
│       │       │   ├── translate.imports.ts
│       │       │   ├── translate.translate-pre.ts
│       │       │   ├── translate.translate-post.ts
│       │       │   ├── page.imports.tsx
│       │       │   ├── page.state.tsx
│       │       │   ├── page.on-mount.tsx
│       │       │   ├── page.on-result.tsx
│       │       │   ├── page.after-result.tsx
│       │       │   └── page.after-form.tsx
│       │       └── ...
│       ├── keyvalue/
│       ├── queue/
│       ├── storage/
│       └── vector/
```

### Snippet filename convention

`<basefile>.<marker>.<ext>`

- `<basefile>` = handle declared in the framework manifest (`translate`, `page`, `landing`, etc.).
- `<marker>` = marker name, hyphenated.
- `<ext>` = matches the target file's extension (`.ts`, `.tsx`, `.svelte`, `.vue`, `.astro`, `.html`).

Composer doesn't parse — it inserts the snippet body verbatim.

### Framework manifest format

`templates/<framework>/manifest.json`:

```json
{
  "framework": "sveltekit",
  "displayName": "SvelteKit",
  "composableFiles": {
    "translate": {
      "path": "src/lib/server/translate.ts",
      "markers": {
        "imports":        { "syntax": "//" },
        "module":         { "syntax": "//" },
        "translate-pre":  { "syntax": "//" },
        "translate-post": { "syntax": "//" }
      }
    },
    "page": {
      "path": "src/routes/+page.svelte",
      "markers": {
        "imports":             { "syntax": "//" },
        "state":               { "syntax": "//" },
        "on-mount":            { "syntax": "//" },
        "on-result":           { "syntax": "//" },
        "inside-form-buttons": { "syntax": "<!-- -->" },
        "after-result":        { "syntax": "<!-- -->" },
        "after-form":          { "syntax": "<!-- -->" }
      }
    }
  }
}
```

### Service manifest format

`templates/services/<id>/manifest.json`:

```json
{
  "id": "db",
  "label": "Database",
  "hint": "PostgreSQL via Drizzle ORM",
  "description": "Cache translations in PostgreSQL. Adds a translations table and history panel.",
  "order": 20,
  "packages": ["drizzle-orm", "@neondatabase/serverless"],
  "devPackages": ["drizzle-kit"],
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate":  "drizzle-kit migrate",
    "db:push":     "drizzle-kit push",
    "db:studio":   "drizzle-kit studio"
  },
  "envVars": [
    { "name": "DATABASE_URL", "placeholder": "postgres://user:pass@host/db",
      "comment": "Set automatically when DB is provisioned" }
  ],
  "frameworks": ["nextjs", "remix", "vite-react", "nuxt", "sveltekit", "astro", "hono"]
}
```

The service catalog (`services-catalog.ts`) loads these manifests at startup and assembles the typed array. Adding a service = adding a `templates/services/<id>/` directory.

## Composer behavior

```ts
// services-composer.ts

interface ComposeInput {
  framework: string;
  dest: string;
  selectedServices: string[];
}

async function composeServices(input: ComposeInput): Promise<void> {
  // 1. Resolve service order from catalog
  // 2. For each service in order:
  //    a. Copy files/<framework>/** into dest (force overwrite — services own these files)
  // 3. For each composable file declared in the framework manifest:
  //    a. Read from dest/ (base overlay already applied by scaffold)
  //    b. For each declared marker:
  //       - find the marker line (using the syntax declared for it)
  //       - look up snippet files <basefile>.<marker>.<ext> from each selected service
  //       - concatenate in catalog order, with single blank lines between
  //       - replace the marker line with the concatenation
  //    c. Write file back to dest/
  // 4. Merge package.json: dependencies, devDependencies, scripts
  // 5. Append to .env.example any envVars not already present
  // 6. Authenticated path: provision cloud resources (DB, KV namespace, queue, vector ns, S3 bucket)
}
```

### Edge cases

- **Empty selection**: every marker line is stripped, no other changes. Output should be byte-equivalent to today's overlay (modulo deletion of marker lines, which themselves are added by the M1/M2 refactor).
- **Snippet missing for a contributed marker**: not an error — service simply contributes nothing for that marker.
- **Snippet present but marker missing**: error. Catch in CI.
- **Marker present but no service contributes**: line is just stripped.
- **Snippet body contains its own internal marker syntax**: composer treats marker lines as literal strings; coincidental matches are vanishingly unlikely with the `// @agentuity:` prefix.

## CLI flow

In `template-flow.ts`, after the AI-example overlay is applied and *before* cloud registration:

```
Pick framework         (existing)
Apply base overlay     (existing — now includes refactored translate.ts + markers)
↓
NEW: Service multi-select
  ┌─ Optional add-ons (interactive only, default none) ─┐
  │ [ ] Database         — Cache translations            │
  │ [ ] Key-Value Store  — Remember preferences          │
  │ [ ] Queue            — Run translations as jobs      │
  │ [ ] Storage          — Export history (needs DB)     │
  │ [ ] Vector Search    — Find similar translations     │
  └──────────────────────────────────────────────────────┘
  → If Storage selected without DB: confirm "Adding DB; needed by Storage."
↓
Compose services (NEW)
↓
bun install            (existing)
↓
Cloud provisioning     (existing — extended)
↓
Project register       (existing)
```

CLI flag for headless: `--services <list>` (comma-separated). Validates and fails-loud if a service requires another not present.

## Cloud provisioning (existing flow extended)

| Service | Cloud resource | Env vars written |
|---|---|---|
| db | Postgres database | `DATABASE_URL` |
| keyvalue | KV namespace named after the project | `AGENTUITY_KV_*` (already supplied by SDK on dev/run) |
| queue | Queue named after the project | `AGENTUITY_QUEUE_*` |
| vector | Vector namespace named after the project | `AGENTUITY_VECTOR_*` |
| storage | S3 bucket named after the project | `AGENTUITY_BUCKET_NAME`, `AGENTUITY_BUCKET_ACCESS_KEY`, `AGENTUITY_BUCKET_SECRET_KEY`, `AGENTUITY_BUCKET_ENDPOINT` |

DB-specific post-step: when `DATABASE_URL` is set, run `bun run db:push` to create the `translations` table. If unauthenticated, print: "Run `bun run db:push` after setting DATABASE_URL."

## Testing

Two layers:

1. **Composer unit tests** — synthetic base + snippets, assert composed output byte-for-byte. Cases:
   - Marker stripped when no contributors.
   - Snippets concatenated in catalog order, not alphabetic or selection-order.
   - Marker syntax respected (`//` vs `<!-- -->`).
   - Snippet missing is silent; marker missing is an error.

2. **End-to-end matrix** — per framework, scaffold with each combination, run `bun install` + `tsc --noEmit` + `bun run build`. Bounded set:
   - PR CI: `[]` and `[all]` per framework — 14 scaffold runs.
   - Nightly: `[]`, `[db]`, `[db, vector]`, `[kv]`, `[all]` per framework — 35 scaffold runs.

The build step alone catches missing imports and undefined identifiers in snippets.

## Implementation milestones

### M1 — Composer + Next.js base refactor
- [ ] Extract `src/lib/translate.ts` with markers (Next.js)
- [ ] Slim `src/app/api/translate/route.ts`
- [ ] Add 7 markers to `src/app/page.tsx`
- [ ] Implement `services-composer.ts` (file copy, marker splice, package.json merge, .env merge)
- [ ] Implement framework manifest loader
- [ ] Wire composer into `template-flow.ts` (no-op when no services selected)
- [ ] Composer unit tests
- [ ] Verify: scaffold a Next.js project with `services=[]`, builds clean, output matches today's behavior modulo whitespace from stripped markers

### M2 — Mirror M1 across remaining frameworks
- [ ] **remix** — extract helper, slim action, mark `home.tsx`, framework manifest
- [ ] **vite-react** — extract helper, delegate from `server.ts`, mark `App.tsx`, manifest
- [ ] **nuxt** — extract helper, slim handler, mark `app.vue` (script + template), manifest
- [ ] **sveltekit** — extract helper, slim form action, mark `+page.svelte` (script + template), manifest
- [ ] **astro** — extract helper, slim API route, mark `index.astro` (frontmatter + script + body), manifest
- [ ] **hono** — extract helper, move HTML to `landing.html`, slim `index.ts`, mark `landing.html`, manifest
- [ ] CI smoke: scaffold each with `[]`, build succeeds

### M3 — DB service
- [ ] Manifest, files (drizzle config, schema, `/api/history` route), snippets per framework
- [ ] Cloud DB provisioning + auto `db:push`
- [ ] Build + run dev server + hit translate endpoint twice + verify cache hit

### M4 — KV service
- [ ] Manifest, snippets, cloud KV namespace
- [ ] Build per framework

### M5 — Queue service
- [ ] Manifest, files (`/api/jobs` route), snippets, cloud queue
- [ ] Build per framework

### M6 — Vector service
- [ ] Manifest, snippets, cloud vector namespace
- [ ] Build per framework

### M7 — Storage service
- [ ] Manifest, files (`/api/export` route), snippets, requires-DB enforcement
- [ ] Build per framework

### M8 — Polish
- [ ] `--services` CLI flag for headless
- [ ] Validate `requires` graph (auto-add deps with confirmation)
- [ ] Unauthenticated path messages

## Decisions locked in

- Markers are insertion-only.
- Service order is fixed by catalog (`kv → db → vector → queue → storage`).
- 11 markers (4 server, 7 view) with consistent names across frameworks.
- Per-framework manifest declares marker syntax per marker.
- Hono refactors to `src/landing.html`; Vite-React refactors to `server/translate.ts`.
- DB uses vanilla `drizzle-orm` + `@neondatabase/serverless` (Agentuity wrappers are deprecated).
- `drizzle-kit push` runs at scaffold time when `DATABASE_URL` is set.
- KV uses fetch-on-mount + on-result, never inline-substitution.
- Storage requires DB.
- Composer is pure text — no AST.

## Open questions deferred to implementation

1. **Frontmatter behavior in Astro for `state`**: Astro frontmatter runs server-side (or build-time in static mode). State that needs to be reactive on the client lives in the bottom `<script>`, not frontmatter. We'll likely need to discriminate: frontmatter `state` is for SSR-time data (e.g., initial preferences from cookie/header — but KV doesn't use that); client-reactive state goes in the bottom `<script>`. Resolve while writing M2 Astro snippets — may move `state` marker to the bottom script and leave only `imports` in frontmatter.

2. **Hono on-result hook syntax**: in the new `landing.html`'s `<script>`, the click handler is imperative. `on-result` snippets contribute lines that run after `data = await res.json()`. Verify the marker placement in M2.

3. **Queue button label / styling**: the `inside-form-buttons` snippet ships a button. Visual consistency with the existing primary Translate button matters. May need a small "secondary button" tailwind class shared via the base CSS.

4. **Composer warn-on-orphan-imports**: when a service contributes to `translate-post` but not `imports`, the body might reference an undefined identifier. Worth a warning in the composer (not an error — sometimes the identifier comes from a sibling service or a copied file). CI build catches the actual error case.
