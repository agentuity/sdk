import { createSubcommand } from '../../../types';
import type { CommandContext } from '../../../types';
import { getCommand } from '../../../command-prefix';

export const llmSubcommand = createSubcommand({
	name: 'llm',
	description: 'Generate a comprehensive prompt for LLM agents',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [{ command: getCommand('prompt llm'), description: 'Run llm command' }],
	async handler(_ctx: CommandContext) {
		const prompt = generateLLMPrompt();
		console.log(prompt);
	},
});

export function generateLLMPrompt(): string {
	return `# Agentuity CLI - Agent Usage Guide

## Overview

The Agentuity CLI is an agent-friendly command-line interface for managing cloud deployments, projects, secrets, and infrastructure. It provides machine-readable output, introspection capabilities, and safety features designed for automated agent usage.

## Key Principles for Agent Usage

1. **Always use \`--json\` for machine-readable output**
   - All commands support \`--json\` for structured output
   - Errors are also output as JSON when using \`--error-format=json\` (automatically set with \`--json\`)

2. **Use \`--explain\` before executing destructive operations**
   - Preview what a command will do without executing it
   - Provides structured explanation with steps, prerequisites, and warnings

3. **Use \`--dry-run\` for safe exploration**
   - Execute validation and planning without making changes
   - Test commands safely before actual execution

4. **Discover capabilities programmatically**
   - Use \`${getCommand('--help=json')}\` to get the complete CLI schema
   - Use \`${getCommand('capabilities show --json')}\` to discover available tasks
   - Use \`${getCommand('schema show')}\` for detailed command metadata

## Machine-Readable Modes

### Global Flags

- \`--json\`: Output in JSON format (machine-readable)
- \`--quiet\`: Suppress non-essential output (only errors shown)
- \`--no-progress\`: Disable progress indicators and spinners
- \`--error-format json\`: Structured error output with error codes
- \`--explain\`: Show what command would do without executing
- \`--dry-run\`: Execute without making changes
- \`--color never\`: Disable color output

### Recommended Flag Combinations

For agent usage:
\`\`\`bash
${getCommand('--json --quiet command')}
\`\`\`

For safe exploration:
\`\`\`bash
${getCommand('--explain command args')}
${getCommand('--dry-run command args')}
\`\`\`

## Introspection Capabilities

### 1. Schema Discovery

Get the complete CLI schema with all commands, arguments, options, and requirements:

\`\`\`bash
${getCommand('--help=json')}
${getCommand('schema show')}
\`\`\`

The schema includes:
- Command names and descriptions
- Arguments (type, required/optional, variadic)
- Options (type, defaults, enums)
- Authentication requirements
- Project requirements
- Examples

### 2. Capabilities Discovery

Get high-level tasks and workflows:

\`\`\`bash
${getCommand('capabilities show --json')}
\`\`\`

This returns:
- Functional capabilities (auth, projects, deployment, secrets, etc.)
- Common workflows with step-by-step instructions
- Requirements for each capability (auth, project)

### 3. Examples

All commands include examples in their help text and schema:

\`\`\`bash
${getCommand('command subcommand --help')}
\`\`\`

## Error Handling

### Structured Errors

When using \`--json\` or \`--error-format=json\`, errors are structured:

\`\`\`json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Invalid project folder",
    "details": {},
    "suggestions": [
      "Use --dir to specify a different directory",
      "Change to a directory containing agentuity.json",
      "Run \\"${getCommand('project create')}\\" to create a new project"
    ]
  }
}
\`\`\`

### Common Error Codes

- \`VALIDATION_FAILED\`: Invalid arguments or options
- \`AUTH_REQUIRED\`: Authentication needed
- \`PROJECT_NOT_FOUND\`: No project configuration found
- \`REGION_REQUIRED\`: Cloud region must be specified
- \`RESOURCE_NOT_FOUND\`: Requested resource doesn't exist
- \`PERMISSION_DENIED\`: Insufficient permissions

### Error Recovery

Always check error details and suggestions for recovery steps. Errors include actionable guidance.

## Authentication Flow

### Required for Most Operations

Many commands require authentication. Check the schema's \`requires.auth\` field.

### Authentication Commands

\`\`\`bash
# Check if authenticated
${getCommand('auth whoami')}

# Login (interactive)
${getCommand('auth login')}

# Signup (interactive)
${getCommand('auth signup')}
\`\`\`

### Non-Interactive Environments

In non-TTY environments:
- Commands requiring interactive input will fail with clear error messages
- Use API keys or pre-authenticate before running automated tasks
- Some commands support \`--confirm\` to skip interactive prompts

## Project Context

### Project-Based Commands

Commands requiring a project look for \`agentuity.json\` in the current directory.

### Specifying Project Directory

\`\`\`bash
${getCommand('--dir /path/to/project command')}
\`\`\`

### Creating a Project

\`\`\`bash
${getCommand('project create')}
\`\`\`

## Common Workflows

### 1. Initial Setup

\`\`\`bash
${getCommand('auth signup')}
${getCommand('auth login')}
${getCommand('project create')}
${getCommand('env set API_KEY <value> --secret')}
\`\`\`

### 2. Deploy Application

\`\`\`bash
# Preview deployment
${getCommand('--explain bundle')}

# Test deployment (dry-run)
${getCommand('--dry-run cloud deploy')}

# Actual deployment
${getCommand('bundle')}
${getCommand('cloud deploy')}

# Check deployment status
${getCommand('--json cloud deployment show')}
\`\`\`

### 3. Manage Environment Variables & Secrets

\`\`\`bash
${getCommand('--json env list')}
${getCommand('env set DATABASE_URL <value> --secret')}
${getCommand('env get DATABASE_URL')}
\`\`\`

### 4. List Resources

\`\`\`bash
${getCommand('--json project list')}
${getCommand('--json cloud deployment list')}
${getCommand('--json kv list')}
\`\`\`

## Best Practices

### 1. Always Validate First

- Use \`--explain\` to understand what will happen
- Use \`--dry-run\` for commands that mutate state
- Check schema to understand command requirements

### 2. Use Structured Output

- Always use \`--json\` when parsing output programmatically
- Parse error messages from structured error format
- Never rely on human-readable text parsing

### 3. Handle Non-Interactive Mode

- Detect TTY status
- Provide all required arguments upfront
- Use \`--confirm\` or similar flags to skip prompts

### 4. Check Requirements

Before running a command, verify from schema:
- Does it require authentication?
- Does it require a project context?
- Does it require organization or region selection?

### 5. Progressive Enhancement

Start with safe operations:
1. Discover capabilities (\`capabilities show\`)
2. Get schema for specific command (\`--help=json\`)
3. Use \`--explain\` to preview
4. Use \`--dry-run\` to test
5. Execute actual command

### 6. Error Recovery

When an error occurs:
1. Parse the error code
2. Read the suggestions array
3. Take corrective action
4. Retry the operation

## Agent Safety Guidelines

### Destructive Operations

For destructive operations (delete, remove, rollback):
1. ALWAYS use \`--explain\` first
2. ALWAYS use \`--dry-run\` before execution
3. Verify the operation matches intent
4. Only then execute the actual command

### Confirmation Flags

Many destructive commands support:
- \`--confirm\`: Skip confirmation prompts (be careful!)
- \`--no-confirm\`: Disable confirmation (dangerous!)

### Non-Destructive Exploration

These are always safe:
- \`--help\`, \`--help=json\`
- \`capabilities show\`
- \`schema show\`
- \`--explain\` (never executes)
- \`--dry-run\` (no side effects)
- List commands (\`list\`, \`ls\`)
- Show commands (\`show\`, \`get\` without mutations)

## Examples for Common Tasks

### Discover All Commands

\`\`\`bash
${getCommand('--help=json')} | jq '.commands[].name'
\`\`\`

### Find Commands Requiring Auth

\`\`\`bash
${getCommand('--help=json')} | jq '.commands[] | select(.requires.auth == true) | .name'
\`\`\`

### Get Details About a Specific Command

\`\`\`bash
${getCommand('auth ssh delete --help')}
${getCommand('--help=json')} | jq '.commands[] | select(.name == "auth")'
\`\`\`

### Test a Deployment

\`\`\`bash
${getCommand('--explain bundle')}
${getCommand('--dry-run cloud deploy')}
${getCommand('cloud deploy')}
\`\`\`

### Safe SSH Key Deletion

\`\`\`bash
${getCommand('--explain auth ssh delete abc123')}
${getCommand('--dry-run auth ssh delete abc123')}
${getCommand('auth ssh delete abc123')}
\`\`\`

## Version Information

This prompt is for Agentuity CLI. Always check the version:

\`\`\`bash
${getCommand('version')}
\`\`\`

The CLI follows semantic versioning. Check schema compatibility across versions.

## Getting Help

- CLI Schema: \`${getCommand('--help=json')}\`
- Capabilities: \`${getCommand('capabilities show')}\`
- Command Help: \`${getCommand('command --help')}\`
- Examples: Included in help text for all commands

## Summary

The Agentuity CLI is designed for agent-friendly usage with:
- Complete introspection via \`--help=json\` and \`schema\` commands
- Machine-readable output via \`--json\`
- Safety features via \`--explain\` and \`--dry-run\`
- Structured errors with recovery suggestions
- Comprehensive examples for all commands

Always start with discovery (\`capabilities\`, \`schema\`), use safety features (\`--explain\`, \`--dry-run\`), and rely on structured output (\`--json\`) for reliable automation.
`;
}

export default llmSubcommand;
