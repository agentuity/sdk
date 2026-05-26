import { useState } from 'react';

const MIGRATION_PROMPT = `
FULL Agentuity v2 → v3 Migration (Framework-First)
You are a migration coding agent. Your task is to migrate an Agentuity v2 runtime app into the v3 framework-first model using the current migration docs and local package source as the source of truth.

Source of Truth
  Use these local files first:
    docs/src/web/content/migration/from-v2.mdx
    docs/src/web/content/migration/runtime-to-frameworks.mdx
    docs/src/web/content/migration/migrate-cli.mdx
    packages/runtime/src/index.ts
    packages/hono/src/index.ts
    packages/migrate/** when tool behavior needs verification
  If docs and source disagree, trust the current package source.

Project Context
  The v2 project to migrate is located at: @<V2_PROJECT_FOLDER>
  Work in place on that project in a clean git branch.
  Do NOT create a sibling project unless the user explicitly asks for a parallel rewrite.
  If the final target framework is not Hono, you may still use the migrator's Hono output as an intermediate step, then move the code into the final framework's route conventions.

High-Level Goal
Move a v2 runtime app into the v3 app model with a strict, phase-based process:
  inventory the current runtime patterns
  run the dry run first
  apply the migration only after showing the dry-run findings
  handle the manual follow-up the migrator cannot decide
  verify the framework build and Agentuity build before calling the work complete

CRITICAL RULES (DO NOT VIOLATE)
  Do NOT invent a v3 runtime container.
  Do NOT treat createApp(), createRouter(), or createAgent() as valid v3 targets.
  Do NOT treat thread or session compatibility stubs as final state.
  Keep state explicit and app-owned.
  Prefer direct service clients. Hono c.var.* is optional, not mandatory.
  Preserve behavior unless a v3 design change is required.
  Ask before pushing, deploying, or changing remote state.

Phase 0 — Repo Sanity
  Confirm the project is actually a v2 runtime app by checking for one or more of:
    @agentuity/runtime imports
    createApp()
    createRouter()
    createAgent()
    app.ts runtime entrypoint
  Inspect:
    package.json
    bun.lock or lockfile in use
    tsconfig files
    app.ts
    src/agent/**
    src/api/**
  Confirm the git worktree state before edits.
  If the project is not a v2 runtime app, stop and explain why.

Phase 1 — Migration Inventory
  Recursively scan the project and build a migration inventory covering:
    runtime entrypoints
    registered agents
    HTTP routes
    service usage through ctx.* or c.var.*
    thread/session usage
    lifecycle hooks such as setup() and shutdown()
    ctx.config or ctx.app usage
    event listeners on agents
    frontend code using Agentuity React, Frontend, or Workbench helpers
    evals, auth, database, object storage, queue, vector, task, schedule, webhook, or sandbox usage

  Output Required
    Produce a complete inventory with file paths.
    Separate:
      auto-rewritable patterns
      guided follow-up
      manual design work

Phase 2 — Dry Run First
  Run:
    npx @agentuity/migrate@beta --v2-to-v3 --dry-run

  Capture and summarize:
    files the migrator expects to create
    files it expects to remove
    dependencies it expects to remove or replace
    manual markers for state, lifecycle, auth, frontend, or app wiring

  Output Required
    Show the dry-run findings before Phase 3.
    If the dry run reveals a blocker or an unexpected app shape, stop and explain it.

Phase 3 — Apply the Migration
  Run:
    npx @agentuity/migrate@beta --v2-to-v3

  Expect the migrator to generate a Hono-oriented starting point because that is the closest mechanical replacement for the v2 runtime HTTP layer.
  Review the diff carefully after the tool runs.

Phase 4 — Review and Manual Follow-Up
  Verify and finish the migration by addressing the patterns the tool cannot own:

  Runtime entrypoint
    Replace app.ts ownership with the framework's normal entrypoint.

  Agents
    Convert remaining runtime-style agents into plain exported functions, route handlers, server functions, queue consumers, or other framework-owned code.

  Services
    Prefer direct clients such as KeyValueClient, QueueClient, VectorClient, SandboxClient, or other service clients imported where needed.
    In Hono routes, keep c.var.* only when it clearly reads better than direct imports.

  State
    Replace ctx.thread, ctx.session, ctx.sessionId, c.var.thread, and similar runtime-owned state with explicit app-owned state such as:
      cookies
      KV records
      database rows
      durable stream state
      platform inspection APIs when the feature is inspection rather than app memory

  Lifecycle
    Move setup() and shutdown() behavior into module initialization, framework lifecycle hooks, or explicit process cleanup.

  Shared runtime state
    Replace ctx.config and ctx.app with explicit imports or framework-managed state.

  Frontend and tooling
    Replace v2 frontend/runtime helpers with normal framework code, auth wiring, or inspection UI.

  Final framework move
    If the target is not Hono, move the generated Hono-shaped code into the target framework's route conventions after the mechanical migration is understood.

Phase 5 — Verification
  Run the project's normal checks first. Prefer:
    bun run typecheck
    bun run build

  Then run the Agentuity packaging check:
    agentuity build

  If the project is not yet linked to Agentuity Cloud, validate and import it before deployment work:
    agentuity project import --validate-only
    agentuity project import

  Do NOT deploy unless the user explicitly asks for deployment.

Final Output Requirements
  Show progress phase by phase.
  Include the migration inventory.
  Summarize the dry-run report.
  List every changed file and why it changed.
  Call out every remaining manual decision explicitly.
  Report the exact verification commands run and whether they passed.

Begin Now
  Start with Phase 0, then Phase 1, using the project at:
  @<V2_PROJECT_FOLDER>`;

export function CopyMigrationPrompt() {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(MIGRATION_PROMPT);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard unavailable
		}
	}

	return (
		<div className="my-4 flex items-center">
			<button
				type="button"
				onClick={handleCopy}
				className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium border border-cyan-700 text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800 transition dark:border-cyan-500 dark:text-cyan-500 dark:hover:bg-[rgba(0,255,255,0.08)] cursor-pointer"
			>
				{copied ? 'Copied' : 'Copy v2→v3 Migration Prompt'}
			</button>
		</div>
	);
}
