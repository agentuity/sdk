import { getCommand } from '../../../command-prefix.ts';
import type { CommandContext } from '../../../types.ts';
import { createSubcommand } from '../../../types.ts';

export const llmSubcommand = createSubcommand({
	name: 'llm',
	description: 'Generate a comprehensive reference prompt for LLM agents',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [
		{
			command: getCommand('ai prompt llm'),
			description: 'Print the LLM reference prompt to stdout',
		},
	],
	async handler(_ctx: CommandContext) {
		const prompt = generateLLMPrompt();
		console.log(prompt);
	},
});

/**
 * Long-form reference prompt for LLM agents driving the Agentuity CLI.
 *
 * Counterpart to `ai intro`, which is a shorter primer. This one is the
 * comprehensive workflow + safety reference. Keep it accurate against
 * the v3 CLI surface; outdated examples are worse than missing ones.
 */
export function generateLLMPrompt(): string {
	return `# Agentuity CLI — Reference Prompt for LLM Agents

This document is the comprehensive operating reference for an LLM
driving the Agentuity CLI. For a shorter first-contact primer run
\`${getCommand('ai intro')}\` instead.

## Mental Model

The Agentuity CLI is the deploy + ops surface for the Agentuity Cloud
Platform. It is **agent-first**: every command exposes a JSON schema
via \`--describe\`, structured input via \`--input\`, machine-readable
output via \`--json\`, and dry/preview modes via \`--dry-run\` /
\`--explain\` / \`--validate\`.

You should treat the CLI like an API. Discover commands via the schema,
construct calls programmatically, parse JSON output, and act on
structured errors. Avoid scraping human-readable text.

## The Core Flags

These flags work on every command and are how an agent should drive
the CLI:

- \`--json\` — emit machine-readable JSON. Implies
  \`--error-format=json\`.
- \`--describe\` — print the command's JSON schema (args, options,
  response shape, requirements, examples) and exit. **No
  authentication required.** Use this before calling any command you
  haven't called before.
- \`--input '<json>'\` — pass arguments + options as a single JSON
  object. Keys are the **camelCase schema keys** from \`--describe\`,
  not the kebab-case CLI flag names (e.g. the flag \`--dry-run\`
  becomes the key \`dryRun\`). CLI flags take precedence over
  \`--input\` values when both are present.
- \`--fields <comma,list>\` — when used with \`--json\`, restrict the
  output to the named fields. Supports dot notation for nested
  fields (e.g. \`--fields "id,name,deployment.region"\`). Useful for
  protecting your context window.
- \`--validate\` — parse and validate inputs against the schema, then
  exit without executing.
- \`--dry-run\` — execute the command's planning phase without making
  changes.
- \`--explain\` — describe in human-readable form what the command
  would do, without executing.
- \`--quiet\` — suppress non-essential output.
- \`--no-progress\` — disable progress indicators / spinners. Useful
  in non-TTY environments where progress output is noise.
- \`--color never\` — disable ANSI color escapes.

### Recommended Combinations

Run a command machine-readably:
\`\`\`bash
${getCommand('--json --no-progress <command>')}
\`\`\`

Inspect a command before calling it:
\`\`\`bash
${getCommand('<command> --describe')}
\`\`\`

Validate without executing:
\`\`\`bash
${getCommand("--validate <command> --input '{...}'")}
\`\`\`

Preview a destructive operation:
\`\`\`bash
${getCommand('--explain <command> <args>')}
${getCommand('--dry-run <command> <args>')}
\`\`\`

## Discovery

Three layers, ordered cheapest-first:

### 1. Whole-CLI Schema

\`\`\`bash
${getCommand('--help=json')}
\`\`\`

Returns every command, its options, requirements, examples. This is
the entry point when you don't know what command to run.

### 2. Capabilities

\`\`\`bash
${getCommand('ai capabilities show --json')}
\`\`\`

Higher-level than commands: groups commands by task (auth, projects,
deployment, services, secrets) and lists common workflows with the
exact command sequence.

### 3. Per-Command Schema

\`\`\`bash
${getCommand('<command> --describe')}
${getCommand('ai schema show')}
\`\`\`

\`--describe\` is the right call once you know which command you want
to invoke; it gives you the full input contract.

## Authentication

Most commands require an authenticated session. Check
\`requires.auth\` in a command's schema before calling it.

\`\`\`bash
# Are we authenticated?
${getCommand('auth whoami')}

# Browser-based login (interactive)
${getCommand('auth login')}
\`\`\`

In non-TTY contexts, log in interactively first, or pre-set
credentials. Commands that require interaction without a TTY fail
with a structured \`AUTH_REQUIRED\` error and a suggestion to run
\`${getCommand('auth login')}\`.

## Project Context

Most cloud-side commands operate on an Agentuity project. The CLI
finds the project via:

1. The \`--project-id <id>\` flag (or \`AGENTUITY_CLOUD_PROJECT_ID\`).
2. An \`agentuity.json\` file in the working directory (or in the
   directory passed via \`--dir\`).

If neither is present and the command requires a project, you'll get
a \`PROJECT_NOT_FOUND\` error.

\`\`\`bash
# Bind to a specific project regardless of cwd
${getCommand('--project-id proj_abc123 cloud deployment list')}

# Run from a different directory
${getCommand('--dir /path/to/project cloud deploy')}
\`\`\`

To create a project (or scaffold a new framework template inside one):
\`\`\`bash
${getCommand('project create')}
\`\`\`

## Build & Deploy

There is **one build pipeline**. \`agentuity build\` and
\`agentuity cloud deploy\` use the same framework detector, the same
adapters (Next.js, TanStack Start, generic), the same packager, the
same typecheck step. \`build\` stops after writing \`.agentuity/\`;
\`cloud deploy\` continues with upload.

You normally don't need a separate \`build\` step before
\`cloud deploy\` — \`cloud deploy\` runs the build internally.

\`\`\`bash
# Local sanity check — produces .agentuity/ for inspection
${getCommand('build')}

# Full pipeline: build, package, encrypt, upload, register
${getCommand('cloud deploy')}

# Preview what would happen
${getCommand('--explain cloud deploy')}

# Build + plan, but don't upload
${getCommand('--dry-run cloud deploy')}

# Get the deploy command's schema (what flags exist?)
${getCommand('cloud deploy --describe')}
\`\`\`

The deploy bundle is a directory called \`.agentuity/\` containing
\`launch.json\`, the framework's build output (preserving the
framework's own directory layout), and \`node_modules\`. The
\`launch.json\` \`processes[0].command\` is what runs in the
container; for a TanStack Start project that's
\`node .output/server/index.mjs\`, for SvelteKit \`node build/index.js\`,
etc.

## Cloud Services

Each Agentuity service has its own subcommand under \`cloud\`. All
support \`--describe\`, \`--json\`, and the standard flags.

\`\`\`bash
${getCommand('cloud keyvalue')}     # KV storage (alias: cloud kv)
${getCommand('cloud vector')}       # Vector database
${getCommand('cloud storage')}      # Object storage
${getCommand('cloud aigateway')}    # AI Gateway: list models, run completions
${getCommand('cloud queue')}        # Message queues
${getCommand('cloud schedule')}     # Cron-like schedules
${getCommand('cloud webhook')}      # Inbound webhooks
${getCommand('cloud sandbox')}      # Code execution sandboxes
${getCommand('cloud email')}        # Inbound + outbound email
${getCommand('cloud db')}           # Postgres databases
${getCommand('cloud stream')}       # Streaming endpoints
\`\`\`

Each service has \`list\`, \`get\`, \`set\`/\`create\`, \`delete\` /
similar verbs. Inspect with \`--describe\` to see exact subcommands.

## Environment Variables & Secrets

Project-scoped env vars (and secrets) sync between a local \`.env\`
and the cloud:

\`\`\`bash
# Show what's set on the cloud side (values redacted by default)
${getCommand('cloud env list --json')}

# Push the local .env file to the cloud (project-scoped)
${getCommand('cloud env push')}

# Push to the org instead of the current project
${getCommand('cloud env push --org')}

# Pull the cloud values into a local .env file
${getCommand('cloud env pull')}
\`\`\`

There is no v2-style \`env set KEY value\`. Edit the \`.env\`, push.

## Error Handling

With \`--json\` (or \`--error-format=json\`), errors look like:

\`\`\`json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "No agentuity.json found in /home/user/work",
    "suggestions": [
      "Run \\"${getCommand('project create')}\\" to create a new project",
      "Use --dir to point at an existing project",
      "Use --project-id to bind to a project by id"
    ]
  }
}
\`\`\`

### Common Error Codes

| Code | What it means |
|---|---|
| \`AUTH_REQUIRED\` | Not authenticated. Run \`${getCommand('auth login')}\`. |
| \`PROJECT_NOT_FOUND\` | No \`agentuity.json\` and no \`--project-id\`. |
| \`VALIDATION_FAILED\` | Bad arg/option. Check \`--describe\` for the schema. |
| \`REGION_REQUIRED\` | A region is needed. Use \`--region\` or set \`AGENTUITY_REGION\`. |
| \`RESOURCE_NOT_FOUND\` | Targeted resource doesn't exist. |
| \`PERMISSION_DENIED\` | Authenticated, but no access to that org/project/resource. |
| \`NETWORK_ERROR\` | Transient. Retry with exponential backoff. |
| \`INTERNAL_ERROR\` | Bug or platform issue. Capture the suggestions and surface them. |

Always read the \`suggestions\` array — it's machine-actionable
guidance, not just human prose.

## Common Workflows

### First-time setup
\`\`\`bash
${getCommand('auth login')}
${getCommand('project create')}
${getCommand('cloud deploy')}
\`\`\`

### Iterate on an existing project
\`\`\`bash
${getCommand('--json cloud deployment list')}
${getCommand('cloud deploy')}
\`\`\`

### Inspect a deployment
\`\`\`bash
${getCommand('--json --fields "id,status,region" cloud deployment list')}
${getCommand('cloud deployment show <deployment-id> --json')}
${getCommand('cloud deployment logs <deployment-id>')}
\`\`\`

### Set a secret
\`\`\`bash
# Edit local .env then push
${getCommand('cloud env push')}
\`\`\`

### Run a model through the AI Gateway
\`\`\`bash
${getCommand('cloud aigateway models --json')}
${getCommand("cloud aigateway complete --model openai/gpt-4o-mini --prompt 'hello'")}
\`\`\`

### Manage KV
\`\`\`bash
${getCommand('cloud keyvalue list-namespaces --json')}
${getCommand('cloud keyvalue set <namespace> <key> <value>')}
${getCommand('cloud keyvalue get <namespace> <key>')}
\`\`\`

## Safety Practices

### Before any mutation
1. \`<command> --describe\` to confirm the schema.
2. \`--explain <command>\` to read what it would do.
3. \`--dry-run <command>\` to plan without touching state.
4. \`--validate <command>\` to check the inputs.
5. Then run for real.

### Confirmation flags
Many commands have a \`--confirm\` (or \`-y\`) flag to skip
interactive confirmation prompts. Use it deliberately in
non-interactive contexts; do not pass it casually for destructive
ops.

### Always-safe commands
These never mutate state:
- \`--describe\`, \`--help\`, \`--help=json\`
- \`ai intro\`, \`ai prompt llm\`, \`ai capabilities show\`,
  \`ai schema show\`
- \`--explain <anything>\`, \`--dry-run <anything>\`,
  \`--validate <anything>\`
- \`auth whoami\`
- Any \`list\` / \`get\` / \`show\` / \`describe\` subcommand

## JSON Cookbook

### Discover all top-level commands
\`\`\`bash
${getCommand('--help=json')} | jq '.commands[].name'
\`\`\`

### Find commands that need authentication
\`\`\`bash
${getCommand('--help=json')} | jq '.commands[] | select(.requires.auth == true) | .name'
\`\`\`

### Get the input schema for a specific command
\`\`\`bash
${getCommand('cloud deploy --describe')} | jq '.options'
\`\`\`

### Pull a single field out of a list response
\`\`\`bash
${getCommand('--json --fields "id,status" cloud deployment list')}
\`\`\`

## CI / Non-Interactive Use

When the CLI doesn't see a TTY:
- Spinners / progress are suppressed (or pass \`--no-progress\` to
  force).
- Interactive prompts fail with a structured error rather than
  hanging.
- Pass all required values via flags, env vars, or \`--input\`.

Useful environment variables:
- \`AGENTUITY_CLI_API_KEY\` + \`AGENTUITY_USER_ID\` — pre-auth
  without an interactive login.
- \`AGENTUITY_CLOUD_ORG_ID\` — pin to an org.
- \`AGENTUITY_CLOUD_PROJECT_ID\` — pin to a project.
- \`AGENTUITY_REGION\` — pin to a region.

## Versioning

\`\`\`bash
${getCommand('version')}
\`\`\`

The CLI is in semver. Cross-version schema changes are reflected in
\`--describe\` output; if a field disappears or changes shape between
versions, your agent should re-run discovery rather than hard-code.

## Where to Look Next

- \`${getCommand('ai intro')}\` — short primer (start here on first
  contact).
- \`${getCommand('ai capabilities show')}\` — task-grouped command
  catalog.
- \`${getCommand('--help=json')}\` — full machine-readable schema.
- \`${getCommand('<command> --describe')}\` — schema for a specific
  command.

## Summary

- Discover with \`--help=json\` and \`--describe\`.
- Drive with \`--input\` and \`--json\`.
- Preview destructive ops with \`--explain\` / \`--dry-run\` /
  \`--validate\`.
- Trim output with \`--fields\`.
- Read errors as JSON; act on the \`suggestions\` array.
- Treat the CLI as an API, not a UI.
`;
}
