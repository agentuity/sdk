# Documentation Content Guidelines

Writing conventions for Agentuity docs pages in this directory.

## Core Principles

1. **Context-then-code**: 1-2 sentences of motivation, then working code immediately
2. **Lean**: Avoid walls of text. Progressive disclosure: basic first, advanced later
3. **Complete**: Every code block has imports, is runnable, includes error handling in substantial examples
4. **Scannable**: Headings, callouts, inline comments that explain "why" not "what"
5. **Benefit-focused, not salesy**: Explain *why* someone would use a feature without hollow adjectives
6. **Source-verified**: Read SDK source and AGENTS.md files before documenting APIs or CLI flags.

## Exemplar Pages

Before writing a new page, read these as reference implementations:

- **Feature doc**: `agents/creating-agents.mdx` -- context-then-code flow, callouts, progressive examples
- **Service doc**: `services/storage/key-value.mdx` -- comparison table, access patterns, comprehensive operations
- **Cookbook pattern**: `cookbook/patterns/chat-with-history.mdx` -- concise, code highlights, thread state
- **Getting started**: `get-started/quickstart.mdx` -- step-by-step, CardLinks, tips
- **Reference**: `agents/ai-gateway.mdx` -- provider tables, how-it-works flow

## Page Types

| Type | Structure | Example |
|------|-----------|---------|
| **Getting started** | Step-by-step, minimal options, one happy path | `get-started/quickstart.mdx` |
| **Feature doc** | Context, basic, advanced, best practices | `agents/creating-agents.mdx` |
| **Service doc** | When-to-use table, access patterns, operations | `services/storage/key-value.mdx` |
| **Cookbook pattern** | Problem statement, complete solution, variations | `cookbook/patterns/*.mdx` |
| **Reference** | Factual, tables, complete flag/option lists | `reference/cli/*.mdx` |

## Page Structure

```
---
title: Action-Oriented Title (e.g., "Calling Other Agents" not "Agent Communication")
description: One sentence explaining what readers will learn
---

# Title

Brief context: what is this for, when do you use it? (1-2 sentences)

## Basic Usage
[Complete code block with imports]

## [Variant/Pattern Name]
[Next complexity level, builds on previous]

## Best Practices
[Short bullets with code, not prose]

## Next Steps
- [Related Topic](path): When you need X
```

## Provider Documentation

Agentuity supports raw provider SDKs and AI SDK providers. When writing docs:

- Keep feature docs provider-agnostic where possible
- Use current model names in code examples; verify they're up to date before publishing
- When listing providers or models in tables, link to each provider's model page
- See [AI Gateway](/agents/ai-gateway) for the canonical list of supported providers

## Code Examples

- Always include imports at the top
- Use `ctx.logger` in server/agent examples, not `console.log`
- Inline comments explain intent ("why"), not syntax ("what")
- No `// @ts-ignore`, `// eslint-disable`, or other suppression comments
- Error handling: required in full examples, optional in minimal snippets
- Strip boilerplate: show only the feature being demonstrated
- Use a balance of raw SDK providers and AI SDK providers (`openai()`, `anthropic()`) in examples

## MDX Components

Available components in doc pages:

- `<Callout type="info|warning|tip" title="...">` -- highlighted notes (see Callouts under Writing Rules)
- `<Steps>` -- numbered step-by-step instructions
- `<Cards>` + `<CardLink>` -- navigation cards for index pages
- Code highlights: `// [!code highlight]` at end of line to emphasize key lines
- Code titles: `` ```typescript title="src/agent/chat/agent.ts" `` for file path context

## Writing Rules

### Headings and Intros

- **Titles** are action-oriented: "Using Key-Value Storage" not "Key-Value Storage Overview"
- **Intros** are 1-2 sentences. Lead with the problem, not the feature. Don't repeat frontmatter description

### Content

- **Optional parameters**: explicitly mark as "optional" in prose. Readers shouldn't need to parse type signatures
- **Standard behavior**: don't dedicate sections to things that "just work." Focus on configuration, edge cases, and non-obvious behaviors
- **Public APIs only**: document user-facing behavior. Exclude internals, framework abstractions, and implementation plumbing

### Links and Callouts

- **Cross-links** include context: "See [Streaming Responses](/agents/streaming-responses) for chunked output patterns" not "See also: Streaming"
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
- All code blocks have imports and are runnable
- `ctx.logger` in agents, `c.var.logger` in routes (not `console.log`)
- No suppression comments (`@ts-ignore`, `eslint-disable`)
- Optional parameters explicitly marked
- Model names are current; provider tables link to model pages
