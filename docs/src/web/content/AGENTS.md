# Documentation Content Guidelines

Writing conventions for Agentuity docs pages in this directory.

## Core Principles

1. **Context-then-code**: 1-2 sentences of motivation, then working code immediately
2. **Lean**: Avoid walls of text. Progressive disclosure: basic first, advanced later
3. **Complete**: Standalone examples include imports and are runnable. Short inline references are fine without imports
4. **Scannable**: Headings, callouts, inline comments that explain "why" not "what"
5. **Benefit-focused, not salesy**: Explain _why_ someone would use a feature without hollow adjectives
6. **Source-verified**: Read SDK source and AGENTS.md files before documenting APIs or CLI flags.
7. **Framework-native**: Check current upstream framework docs before documenting framework examples. Local Agentuity verification is required, but working code is not enough if the framework shape is not idiomatic.

## Current Agentuity Model

Agentuity is infrastructure for deploying apps, APIs, static sites, backend work, and agents. Start from the thing the reader is building: a framework app, backend API, static site, background job, or model-backed agent.

Agentuity adds deploy packaging, local development wiring, and built-in agent-native services, for example storage, databases, sandboxes, AI Gateway, observability, and Coder. Link to [Services](/services) when the reader needs the full service catalog.

Treat existing app tools and Agentuity-native services as complementary. Readers can keep their framework logger, OpenTelemetry collector, database client or ORM, provider SDKs, and framework conventions. Use Agentuity services when built-in credentials, managed resources, inspection surfaces, or coding-agent-friendly composition reduce setup.

In these docs, an agent is model-backed app code with a clear task. It can live in a route, server function, queue consumer, schedule target, script, or shared module. Agentuity also deploys apps, APIs, services, and static sites that are not themselves agents.

When a page is not about migration, explain the current app shape directly. Do not frame normal docs as a v2-to-v3 comparison.

## SDK Explorer Explanations

SDK Explorer demos teach with just-in-time learning. Each explanation answers the question the demo raises at that moment: what the concept is, when to use it, what to notice in the live demo or code, and where to go next.

Do not assume the reader already knows routes, services, streaming, or agents. Tie the explanation to the behavior on the page. Keep the explanation smaller than a guide, then link to the canonical docs page for setup or reference.

Use one clear server shape in Explorer examples. Hono is the default because route and service boundaries are visible. Mention a few transferable framework shapes only when useful, for example Next.js route handlers, SvelteKit `+server.ts`, or TanStack Start server routes. Link to [Frameworks](/frameworks) instead of listing every framework.

## Exemplar Pages

Before writing a new page, read these as reference implementations:

- **Feature doc**: `build/agents/index.mdx` -- context-then-code flow, callouts, progressive examples
- **Service doc**: `services/storage/key-value.mdx` -- comparison table, access patterns, comprehensive operations
- **Cookbook pattern**: `cookbook/patterns/chat-with-history.mdx` -- concise, code-first, key-value history
- **Getting started**: `get-started/quickstart.mdx` -- step-by-step, CardLinks, tips
- **Reference**: `services/ai-gateway.mdx` -- provider tables, how-it-works flow
- **SDK Reference**: `reference/sdk-reference/coder.mdx` -- hybrid narrative + structured method docs

Framework and Build pages still need the same depth as feature and service docs: when-to-use guidance, a complete example, validation steps, gotchas, and source links. Do not ship pages that are only setup commands plus a trivial route snippet.

## Page Types

| Type                 | Structure                                        | Example                          |
| -------------------- | ------------------------------------------------ | -------------------------------- |
| **Getting started**  | Step-by-step, minimal options, one happy path    | `get-started/quickstart.mdx`     |
| **Feature doc**      | Context, basic, advanced, best practices         | `build/agents/index.mdx`         |
| **Service doc**      | When-to-use table, access patterns, operations   | `services/storage/key-value.mdx` |
| **Cookbook pattern** | Problem statement, complete solution, variations | `cookbook/patterns/*.mdx`        |
| **Reference**        | Factual, tables, complete flag/option lists      | `reference/cli/*.mdx`            |
| **SDK Reference**    | Narrative intro, then structured method docs     | `reference/sdk-reference/coder.mdx` |

### SDK Reference Page Convention

SDK Reference pages use a hybrid format: narrative intro followed by structured method documentation.

**Page structure:**

```
---
title: Descriptive Title
short_title: Short Sidebar Label
description: One sentence about the SDK surface
---

Brief intro (1-2 sentences), standalone callout if applicable, cross-link to how-to page.

### methodName

`methodName(param: string, options?: Options): Promise<Result>`

One sentence describing what this method does.

**Parameters:**
- `param`: What it is
- `options` (optional): What it configures

**Returns:** `Promise<Result>`

(Interface block if return type is complex)

**Example:**

\```typescript
const result = await client.methodName('value', 'key');
\```
```

Each method gets: **parameters + return type + example**. Mark optional parameters explicitly. Use param tables (`| Param | Type | Required | Description |`) for methods with many parameters.

**Exemplars:** `reference/sdk-reference/coder.mdx`, `reference/sdk-reference/schema.mdx`

## Page Structure

```
---
title: Action-Oriented Title (e.g., "Calling Other Agents" not "Agent Communication")
short_title: Concise Sidebar Label (optional, falls back to title if omitted)
description: One sentence explaining what readers will learn
---

# Title

Brief context: what is this for, when do you use it? (1-2 sentences)

## Basic usage
[Complete code block with imports]

## [Variant/Pattern Name]
[Next complexity level, builds on previous]

## Best practices
[Short bullets with code, not prose]

## Next steps
- [Related Topic](path): When you need X
```

## Sidebar Navigation

The sidebar is auto-generated at build time by `scripts/generate-nav-data.ts`. Page ordering within each section is controlled by the `meta.json` file in the same directory. When adding a new page, add its slug to the `pages` array in the relevant `meta.json`.

## Generated Reference Pages

REST API reference pages in `src/web/content/reference/api/*.mdx` are generated
from service metadata and Zod schemas. Do not hand-edit those MDX files as the
source of truth.

To update REST API docs:

1. Edit the owning schema, type, or `packages/core/src/services/*/api-reference.ts` file.
2. Run `bun run scripts/generate-api-reference.ts` from `docs/`.
3. Commit the generated `reference/api/*.mdx` output if it changes.

Generated diffs are expected when the source metadata changes. If the generated
output does not match what you want, fix the source metadata and regenerate.

## Adding a New Page

Every new page requires **three things**:

1. **MDX content file** in `src/web/content/` (the page content)
2. **Route file** in `src/web/routes/_docs/` (TanStack Router needs this to serve the page)
3. **meta.json entry** in the same content directory (controls sidebar ordering)

Without the route file, the page shows "Not Found" at runtime even though the build passes. The `scripts/validate-routes.ts` script runs during prebuild and auto-generates any missing route files.

Route file template (generated automatically, but for reference):

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/section/page-name')({
	component: () => <MDXPage route="section/page-name" />,
	staticData: { crumb: 'Page Title' },
});
```

The import depth for `MDXPage` varies by nesting level. Run `bun run scripts/validate-routes.ts` to generate correct route files, or use `--check` to validate without generating.

## Provider Documentation

Agentuity supports raw provider SDKs and AI SDK providers. When writing docs:

- Keep feature docs provider-agnostic where possible
- Use current model names in code examples; verify they're up to date before publishing
- When listing providers or models in tables, link to each provider's model page
- See [AI Gateway](/services/ai-gateway) for the canonical list of supported providers

## Service Client Guidance

When writing service docs, verify the package that owns the feature being documented.
Do not use a neighboring helper package as proof that another service works.

Relational database helpers belong in database-specific, migration, or reference pages.
They should not be the default state example for unrelated services, and they should not
stand in for testing storage, messaging, execution, observability, identity, or other
dedicated service clients.

Examples:

- for key-value docs, test `KeyValueClient` directly instead of proving state storage
  with a SQL helper
- for queues, tasks, schedules, email, webhooks, sandboxes, and Coder, verify the
  dedicated client or CLI surface that owns that behavior
- for relational data, use the database docs and frame the example as app-owned
  Postgres or trusted database administration

## Code Examples

Code blocks fall into two categories:

- **Inline references**: Show API shape, config values, or method signatures. Imports not needed. Use these freely in prose to keep things scannable.
- **Standalone examples**: Demonstrate a concept or pattern. Include imports at the top, should be copy-pasteable.

General rules:

- Use `c.var.logger` in Hono route examples or `logger` from `@agentuity/telemetry` in standalone server examples, not `console.log`
- Inline comments explain intent ("why"), not syntax ("what")
- No `// @ts-ignore`, `// eslint-disable`, or other suppression comments
- Error handling: include in substantial examples, optional in short ones
- Strip boilerplate: show only the feature being demonstrated
- Use `// [!code highlight]` on the smallest set of lines that teach the point
  the surrounding paragraph makes. Prefer 1-3 highlighted lines per block, and
  avoid highlighting imports unless the import itself is the point.
- Use a balance of raw SDK providers and AI SDK providers (`openai()`, `anthropic()`) in examples
- Use the validation library that fits the page and the surrounding framework.
  Zod, ArkType, and Valibot are all valid Standard Schema examples. Use
  `@agentuity/schema` only on its reference page, in migration notes, or when
  documenting that package directly.

### Environment and Migration Examples

- For local-only browser callback values, use `.env.local`. Verify env file precedence before naming an override file.
- For Drizzle Kit setup, show `drizzle.config.ts` with `defineConfig`, then run `bunx drizzle-kit push` or the normal `generate` / `migrate` flow from that config. Avoid inline `--dialect`, `--schema`, and `--url` commands unless the page is documenting those flags.
- For deployed origins, say "app URL" and point to `urls.app`. Do not call the dashboard URL or project ID the app URL.

## Static Assets

Images and other static files live in `src/web/public/`. Vite copies these to the build root, so reference them **without** the `/public/` prefix:

- Correct: `/images/integrations/openai.svg`
- Wrong: `/public/images/integrations/openai.svg`

## MDX Components

Available components in doc pages:

- `<Callout type="info|warning|tip" title="...">` -- highlighted notes (see Callouts under Writing Rules)
- `<Steps>` -- numbered step-by-step instructions
- `<Cards>` + `<CardLink>` -- navigation cards for index pages
- Code highlights: `// [!code highlight]` at end of line to emphasize key lines
- Code titles: ` ```typescript title="src/agent/chat/agent.ts" ` for file path context

## Writing Rules

### Headings and Intros

- **Titles** are action-oriented: "Using Key-Value Storage" not "Key-Value Storage Overview"
- **Headings** create hierarchy for readers, agents, and the right-side "On this page" table of contents. Use concrete labels that scan well in the ToC. Prefer Title Case for short, chapter-like headings such as "Running Your Application" or "JSON Schema Support". Use sentence case for questions and explanatory headings such as "What is `launch.json`?" or "Configure your AI Gateway API key". Preserve exact casing for product names, acronyms, API names, config keys, CLI commands, file names, model IDs, and code identifiers.
- **Intros** are 1-2 sentences. Lead with the problem, not the feature. Don't repeat frontmatter description

### Content

- **Optional parameters**: explicitly mark as "optional" in prose. Readers shouldn't need to parse type signatures
- **Standard behavior**: don't dedicate sections to things that "just work." Focus on configuration, edge cases, and non-obvious behaviors
- **Public APIs only**: document user-facing behavior. Exclude internals, framework abstractions, and implementation plumbing

### Links and Callouts

- **Cross-links** include context: "See [Chat and Streaming](/build/agents/chat-and-streaming) for chunked output patterns" not "See also: Streaming"
- **External links**: link on first mention. Don't re-link on the same page
- **Canonical docs**: link to existing docs instead of re-explaining. One location is canonical, others link to it
- **Callouts**: `info` for context and clarifications, `warning` for gotchas and required setup, `tip` for optimizations and advanced patterns

### Don't

- Start with feature descriptions ("The key-value storage system provides a fast, distributed..."). Lead with the use case instead
- Document defaults as features. If schema validation happens automatically, mention it inline, don't give it a section
- Use generic cross-links ("See also: Streaming"). Always add context for why the reader would follow the link

## Style

- Replace hollow adjectives (e.g., powerful, seamless, enterprise-grade) with the specific benefit
- Instead of "production," say what you mean: local, deployed, live, etc.
- Prefer precise alternatives: "consistent API" over "unified," "This keeps..." over "This ensures..."
- Prefer specific language: focused, reusable, type-safe, observable, simpler, faster
- Prefer commas, periods, or colons over em-dashes

## Quick Checklist

### Content

- Title is action-oriented
- Intro is 1-2 sentences, problem-focused, adds value beyond frontmatter
- Page structure matches its type (see Page Types)
- No sections explaining default/automatic behavior
- Cross-links have specific context
- External tools linked on first mention only

### Code

- First code block appears early
- Standalone examples have imports and are runnable
- `c.var.logger` in Hono route examples and `logger` from `@agentuity/telemetry` in standalone server examples, not `console.log`
- No suppression comments (`@ts-ignore`, `eslint-disable`)
- Optional parameters explicitly marked
- Model names are current; provider tables link to model pages
