import { useState } from 'react';

const MIGRATION_PROMPT = `
FULL Agentuity v0 → v1 Migration (Side-by-Side Project)
You are a migration coding agent. Your task is to migrate an Agentuity v0 example project into a new Agentuity v1 project using the official "Migrating from v0 to v1" guide as the single source of truth.

Project Context
  The v0 project to migrate is located at: @<V0_PROJECT_FOLDER>
  This repository may contain multiple examples.
  You must only read files that belong to this v0 project.
  You must create the new v1 Agentuity project at the same directory level as the v0 project (a sibling folder).
  Do NOT modify or delete the v0 project.

High-Level Goal
Migrate an Agentuity v0 example project into a new Agentuity v1 project using a strict, phase-based process.
All project creation and filesystem changes must occur only when explicitly instructed in the relevant phase.

CRITICAL RULES (DO NOT VIOLATE)
  Do NOT edit any files in the v0 project
  Do NOT guess CLI prompt answers
  Do NOT invent APIs, patterns, or abstractions not present in the migration guide
  All new code must live only inside the newly created v1 project
  Follow migration phases in order
  Preserve behavior exactly unless a change is explicitly required by v1


Phase 0 — Authentication & CLI Readiness (REQUIRED)
This phase is a PASS/FAIL gate.
You are NOT allowed to debug, repair, or modify the environment.

ABSOLUTE RULES:
  Do NOT inspect node_modules
  Do NOT uninstall packages
  Do NOT reinstall more than once
  Do NOT attempt root-cause analysis
  Do NOT retry failed commands
  Do NOT infer fixes
  Do NOT modify the filesystem

Steps (in order):
  Check that the Agentuity CLI is available
    Run: agentuity --version
    If command is not found, install with full permissions via:
      curl -sSL https://agentuity.sh | sh
    Re-check version
  Ensure the CLI is up to date.
    If the CLI was installed via the Agentuity installer:
      Run: agentuity upgrade
    If the CLI reports it is installed as a project dependency:
      Run: bun add @agentuity/cli@latest
      If the upgrade fails, surface the error and stop.
      Do not force reinstall unless explicitly instructed
  Confirm authentication
    Run: agentuity auth whoami
    If not authenticated:
      Run: agentuity auth login
      Wait for the user to complete browser login
      Re-run agentuity auth whoami
  Once authenticated, proceed immediately
    Do not retry
    Do not re-check
    Do not reinstall again

That's it.
No filesystem changes. No heuristics.


Phase 1 — Comprehensive v0 Project Scan
Recursively scan all files and folders that belong to the v0 project, including (but not limited to):
  src/agent*, src/agents*
  src/api*, src/routes*
  src/tools/
  src/utils/, src/helpers/, src/lib/
  Any other files contributing to runtime behavior or business logic

Identify and Categorize
  Agent handlers using @agentuity/sdk or AgentHandler
  HTTP endpoints or request parsing logic
  Tooling modules (tools/, utils/, helpers/, etc.)
  Shared helpers or services used by agents
  Any usage of:
    context.runId
    context.getAgent
    context.objectstore
    KV / Vector stores
    Cron, email, or SMS triggers


Output Required
Produce a complete migration inventory listing:
  Agents found (with file paths)
  Routes / endpoints found
  Tool / helper modules and where they're used
  Cross-agent calls
  Services used

Do NOT begin migration until this inventory is shown.


Phase 2 — Create Fresh v1 Project (CLI-Driven)
Rules for Phase 2
  Do NOT prompt for region
  Do NOT prompt for template
  Do NOT prompt for org
  Do NOT retry creation
  Do NOT auto-detect templates

Canonical command
  agentuity create \\
    --name <v1-project-name> \\
    --region use \\
    --template default

Where:
<v1-project-name> = <v0-project-name>-v1

Example:
tool-calling → tool-calling-v1

That's it. If this fails, surface the error and stop.

Directory Semantics (CRITICAL)
The Agentuity CLI creates a new project directory inside the directory passed to it. Therefore:
  The directory you pass must be the parent directory, not the final project directory
  Do NOT pre-create the v1 project folder
  Expect the CLI to create the project folder itself
  If the CLI creates a nested directory, detect it and treat the inner folder as the project root

Project Creation Rules
  Create the v1 project at the same directory level as the v0 project
  Since the user is authenticated, the project must be created and registered with Agentuity Cloud

Dependency Installation Caveat
If dependency installation fails inside the sandbox (for example, due to Bun temp directory permissions):
  Explicitly note the failure
  Re-run dependency installation outside the sandbox
  Continue only once dependencies install successfully


Phase 3 — Prepare v1 Structure
Confirm the new v1 project contains:
  src/agent/
  src/api/index.ts
  v1 runtime dependencies from the scaffold (for example: @agentuity/runtime, @agentuity/schema)

Exception:
If the v1 scaffold includes a default demo agent or frontend (for example, a "translate" agent) that was not part of the v0 project:
  Remove the unused demo agent folder.
  Update the existing frontend to match the migrated v0 agent's actual functionality.

Otherwise, do NOT modify the scaffold files.


Phase 4 — Migrate Agents (Guide Steps 2 + 3)
For each v0 agent, create the file:
  src/agent/<agent-name>/agent.ts

Convert
  AgentHandler → createAgent()
  (request, response, context) → (ctx, input)
  response.*() → direct return values

Replace context usage
  context.runId → ctx.sessionId
  context.logger → ctx.logger
  context.kv → ctx.kv

Schema Rules (IMPORTANT — Type Safety)
  Define explicit input and output schemas for every migrated agent
  Prefer using @agentuity/schema for schema definitions, as it is the v1-native, type-safe approach
  Fall back to Zod only when a schema cannot be reasonably expressed using @agentuity/schema
  If the v0 agent did not define schemas explicitly, infer the minimal correct schema from actual usage without changing behavior

Additional Rules
  Remove all request parsing logic from agent files
  Preserve original business logic exactly unless a change is explicitly required by v1
  If deprecated imports are detected, replace them with the correct v1-compatible alternatives and explicitly note why the change was required


Phase 5 — Migrate Supporting Files (Tools, Utils, Helpers)
For each non-agent functional file identified in Phase 1:
  Recreate the file inside the new v1 project (for example: src/tools/, src/utils/)
  Update imports to match the new structure
  Do NOT change behavior unless required for v1 compatibility
  Ensure all agents and routes reference these files correctly


Phase 6 — Migrate Dependencies
Inspect the v0 project's package.json and extract dependencies and devDependencies.
Cross-reference them against actual imports found in:
  Agents
  Routes
  Tools / utils / helpers

Rules
  v0-only dependencies (for example: @agentuity/sdk) must NOT be migrated
  If a dependency has a v1 replacement, use the v1 equivalent
  If a dependency is general-purpose and still used, add it to the v1 project
  Do NOT copy the v0 package.json wholesale
  Do NOT remove scaffold dependencies unless you confirm they are unused
  Prefer bun install or bun add unless the scaffold indicates otherwise

Output Required
Provide a summary listing:
  Removed dependencies
  Replaced dependencies
  Added dependencies


Phase 7 — Migrate Routes (Guide Steps 4 + 5)
In src/api/index.ts:
  Import agents using @agent/<agent-name>
  Parse input via c.req.json() or agent.validator()
  Call agents using agent.run(input)
  Return responses using c.json(), c.text(), or c.body()

If the generated v1 build or type registry fails due to unresolved agent imports
(for example, missing 'index' in generated import paths):
  Add a minimal barrel re-export file at src/agent/<agent-name>.ts that re-exports the agent's index module.
  Do NOT change the agent implementation itself.


Phase 8 — Migrate Services (Guide Step 6)
  KV / Vector storage remains unchanged
  Replace context.objectstore with Bun S3
  Replace expiresDuration with expiresIn
  Migrate database usage only if the v0 project already used one


Phase 9 — Agent-to-Agent Communication (Guide Step 7)
  Replace context.getAgent with direct imports
  Call other agents using otherAgent.run(input)
  Remove JSON stringification and manual parsing


Phase 10 — Final Validation
Provide a checklist confirming:
  v0 project remains untouched
  New v1 project created successfully
  All functional files (agents, tools, helpers) migrated
  No @agentuity/sdk imports remain
  No request/response usage inside agents
  Routes live in src/api/index.ts
  Services migrated correctly
  Typecheck passes
  Build passes

Output Requirements
  Show progress phase by phase
  Include full file contents for any files created or modified
  Clearly indicate when user input is required in the terminal


Begin Now
  Start with Phase 0 (Authentication & CLI Readiness), then proceed to Phase 1 by scanning the v0 project located at:
  @<V0_PROJECT_FOLDER>`;

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
				className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium border border-cyan-800 text-cyan-800 hover:bg-cyan-50 hover:text-cyan-900 transition dark:border-cyan-500 dark:text-cyan-500 dark:hover:bg-[rgba(0,255,255,0.08)] cursor-pointer"
			>
				{copied ? 'Copied' : 'Copy Migration Prompt'}
			</button>
		</div>
	);
}
