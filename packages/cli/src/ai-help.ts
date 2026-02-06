/**
 * AI Help Generator - dashdash specification implementation
 *
 * Generates AI-optimized help output in dashdash format (https://github.com/visionik/dashdash)
 * for improved discoverability and usability by AI agents.
 */

import type { CLISchema, SchemaCommand } from './schema-generator';

export interface DashdashConfig {
	name: string;
	description: string;
	accessLevel: 'read' | 'browse' | 'interact' | 'full';
	webUrl: string;
	apiUrl: string;
	docsUrl: string;
	mcpUrl?: string;
	homepage: string;
	repository: string;
}

const DEFAULT_CONFIG: DashdashConfig = {
	name: 'agentuity',
	description: `CLI for building, deploying, and managing AI agents on the Agentuity platform.
  Use when user asks to create agents, deploy projects, or interact with Agentuity cloud services.`,
	accessLevel: 'interact',
	webUrl: 'https://app.agentuity.com',
	apiUrl: 'https://api.agentuity.com',
	docsUrl: 'https://agentuity.dev',
	homepage: 'https://agentuity.com',
	repository: 'https://github.com/agentuity/sdk',
};

/**
 * Generate dashdash-compliant AI help output
 */
export function generateAIHelp(schema: CLISchema, config: DashdashConfig = DEFAULT_CONFIG): string {
	const frontMatter = buildFrontMatter(schema, config);
	const content = buildContent(schema, config);

	return `${frontMatter}\n${content}`;
}

/**
 * Build YAML front matter per dashdash spec
 */
function buildFrontMatter(schema: CLISchema, config: DashdashConfig): string {
	const lines = [
		'---',
		`name: ${config.name}`,
		'description: >',
		...config.description.split('\n').map((line) => `  ${line.trim()}`),
		'',
		'spec-url: https://github.com/visionik/dashdash',
		'spec-version: 0.2.0',
		'',
		'subcommand-help: true',
		`access-level: ${config.accessLevel}`,
		'',
		`web-url: ${config.webUrl}`,
		`api-url: ${config.apiUrl}`,
		`mcp-url: ${config.mcpUrl ?? 'none'}`,
		'',
		'install:',
		'  npm: "@agentuity/cli"',
		'  bun: "@agentuity/cli"',
		'',
		'requires:',
		'  auth:',
		'    - api-key',
		'  env:',
		'    - AGENTUITY_API_KEY',
		'',
		'invocation:',
		'  model-invocable: true',
		'  user-invocable: true',
		'',
		`homepage: ${config.homepage}`,
		`repository: ${config.repository}`,
		`content-version: ${schema.version}`,
		'---',
	];

	return lines.join('\n');
}

/**
 * Build markdown content
 */
function buildContent(schema: CLISchema, config: DashdashConfig): string {
	const sections = [
		buildHeader(config),
		buildWhenToUse(),
		buildQuickReference(schema),
		buildCommandReference(schema),
		buildGlobalOptions(schema),
		buildAuthentication(),
		buildExitCodes(schema),
		buildAlternativeAccess(config),
	];

	return sections.join('\n\n');
}

function buildHeader(config: DashdashConfig): string {
	return `# ${config.name}

> ${config.description.split('\n')[0]?.trim()}`;
}

function buildWhenToUse(): string {
	return `## When to Use

Use this CLI when the user asks to:
- Create, build, or deploy AI agents
- Manage Agentuity projects and organizations
- Access cloud services (KV, Vector, Postgres, Storage, Sandboxes)
- Debug or troubleshoot agent deployments
- Run agents locally in development mode
- Manage environment variables and secrets
- View deployment logs or rollback deployments

Do NOT use this CLI for:
- Non-Agentuity projects or general Node.js/Bun development
- General file operations (use filesystem tools instead)
- Non-AI/agent related tasks
- Direct database queries (use the SDK or cloud console)`;
}

/**
 * Build Quick Reference with 15-20 most common operations
 */
function buildQuickReference(schema: CLISchema): string {
	const quickCommands = collectQuickReferenceCommands(schema);

	const lines = ['## Quick Reference', ''];

	for (const cmd of quickCommands) {
		lines.push(`- **${cmd.label}:** \`${cmd.command}\``);
	}

	return lines.join('\n');
}

interface QuickCommand {
	label: string;
	command: string;
	priority: number;
}

/**
 * Collect the most important commands for quick reference
 */
function collectQuickReferenceCommands(schema: CLISchema): QuickCommand[] {
	const commands: QuickCommand[] = [];

	// Define priority commands explicitly for better curation
	const priorityCommands: Array<{ path: string; label: string; priority: number }> = [
		{ path: 'login', label: 'Login', priority: 1 },
		{ path: 'project create', label: 'Create project', priority: 2 },
		{ path: 'dev', label: 'Run locally', priority: 3 },
		{ path: 'deploy', label: 'Deploy', priority: 4 },
		{ path: 'cloud logs', label: 'View logs', priority: 5 },
		{ path: 'cloud sandbox list', label: 'List sandboxes', priority: 6 },
		{ path: 'cloud sandbox create', label: 'Create sandbox', priority: 7 },
		{ path: 'cloud sandbox exec', label: 'Execute in sandbox', priority: 8 },
		{ path: 'cloud kv get', label: 'KV get', priority: 9 },
		{ path: 'cloud kv set', label: 'KV set', priority: 10 },
		{ path: 'cloud vector search', label: 'Vector search', priority: 11 },
		{ path: 'cloud db list', label: 'List databases', priority: 12 },
		{ path: 'cloud db exec', label: 'Execute SQL', priority: 13 },
		{ path: 'env list', label: 'List env vars', priority: 14 },
		{ path: 'env set', label: 'Set env var', priority: 15 },
		{ path: 'cloud deployment list', label: 'List deployments', priority: 16 },
		{ path: 'cloud deployment rollback', label: 'Rollback deployment', priority: 17 },
		{ path: 'project list', label: 'List projects', priority: 18 },
		{ path: 'auth whoami', label: 'Show current user', priority: 19 },
		{ path: 'version', label: 'Show version', priority: 20 },
	];

	// Build command signatures from schema
	const commandMap = buildCommandMap(schema.commands);

	for (const pc of priorityCommands) {
		const schemaCmd = commandMap.get(pc.path);
		if (schemaCmd) {
			const signature = buildCommandSignature(pc.path, schemaCmd);
			commands.push({
				label: pc.label,
				command: `agentuity ${signature}`,
				priority: pc.priority,
			});
		} else {
			// Fallback for commands that might not be in schema yet
			commands.push({
				label: pc.label,
				command: `agentuity ${pc.path}`,
				priority: pc.priority,
			});
		}
	}

	return commands.sort((a, b) => a.priority - b.priority);
}

/**
 * Build a map of command paths to their schema definitions
 */
function buildCommandMap(
	commands: SchemaCommand[],
	prefix: string = ''
): Map<string, SchemaCommand> {
	const map = new Map<string, SchemaCommand>();

	for (const cmd of commands) {
		const path = prefix ? `${prefix} ${cmd.name}` : cmd.name;
		map.set(path, cmd);

		if (cmd.subcommands) {
			const subMap = buildCommandMap(cmd.subcommands, path);
			for (const [subPath, subCmd] of subMap) {
				map.set(subPath, subCmd);
			}
		}
	}

	return map;
}

/**
 * Build a command signature with arguments
 */
function buildCommandSignature(path: string, cmd: SchemaCommand): string {
	let signature = path;

	if (cmd.arguments) {
		for (const arg of cmd.arguments) {
			if (arg.variadic) {
				signature += arg.required ? ` <${arg.name}...>` : ` [${arg.name}...]`;
			} else {
				signature += arg.required ? ` <${arg.name}>` : ` [${arg.name}]`;
			}
		}
	}

	return signature;
}

/**
 * Build full command reference
 */
function buildCommandReference(schema: CLISchema): string {
	const lines = ['## Command Reference', ''];

	for (const cmd of schema.commands) {
		lines.push(...buildCommandSection(cmd, 'agentuity'));
	}

	return lines.join('\n');
}

/**
 * Build a command section recursively
 */
function buildCommandSection(cmd: SchemaCommand, prefix: string, depth: number = 3): string[] {
	const lines: string[] = [];
	const fullPath = `${prefix} ${cmd.name}`;
	const heading = '#'.repeat(Math.min(depth, 6));

	// Skip hidden/internal commands
	if (cmd.tags?.includes('hidden') || cmd.skipSkill) {
		return lines;
	}

	lines.push(`${heading} ${fullPath}`);
	lines.push('');
	lines.push(cmd.description);
	lines.push('');

	// Arguments
	if (cmd.arguments && cmd.arguments.length > 0) {
		lines.push('**Arguments:**');
		for (const arg of cmd.arguments) {
			const req = arg.required ? '(required)' : '(optional)';
			lines.push(`- \`${arg.name}\` ${req}${arg.description ? ` - ${arg.description}` : ''}`);
		}
		lines.push('');
	}

	// Options
	if (cmd.options && cmd.options.length > 0) {
		lines.push('**Options:**');
		for (const opt of cmd.options) {
			const flag = `--${camelToKebab(opt.name)}`;
			const defaultVal =
				opt.default !== undefined ? ` (default: ${JSON.stringify(opt.default)})` : '';
			lines.push(`- \`${flag}\`${defaultVal}${opt.description ? ` - ${opt.description}` : ''}`);
		}
		lines.push('');
	}

	// Requirements
	const reqs: string[] = [];
	if (cmd.requires?.auth) reqs.push('authentication');
	if (cmd.requires?.project) reqs.push('project');
	if (cmd.requires?.org) reqs.push('organization');
	if (cmd.requires?.region) reqs.push('region');

	if (reqs.length > 0) {
		lines.push(`**Requires:** ${reqs.join(', ')}`);
		lines.push('');
	}

	// Examples
	if (cmd.examples && cmd.examples.length > 0) {
		lines.push('**Examples:**');
		lines.push('```bash');
		for (const ex of cmd.examples.slice(0, 3)) {
			lines.push(`# ${ex.description}`);
			lines.push(ex.command);
		}
		lines.push('```');
		lines.push('');
	}

	// Subcommands
	if (cmd.subcommands && cmd.subcommands.length > 0) {
		for (const sub of cmd.subcommands) {
			lines.push(...buildCommandSection(sub, fullPath, depth + 1));
		}
	}

	return lines;
}

/**
 * Build global options section
 */
function buildGlobalOptions(schema: CLISchema): string {
	const lines = ['## Global Options', '', 'These options can be used with any command:', ''];

	for (const opt of schema.globalOptions) {
		const flag = `--${camelToKebab(opt.name)}`;
		const defaultVal =
			opt.default !== undefined ? ` (default: ${JSON.stringify(opt.default)})` : '';
		lines.push(`- \`${flag}\`${defaultVal}${opt.description ? ` - ${opt.description}` : ''}`);
	}

	return lines.join('\n');
}

function buildAuthentication(): string {
	return `## Authentication

Most commands require authentication. Set the \`AGENTUITY_API_KEY\` environment variable or run:

\`\`\`bash
agentuity login
\`\`\`

To check your current authentication status:

\`\`\`bash
agentuity auth whoami
\`\`\``;
}

function buildExitCodes(schema: CLISchema): string {
	const lines = ['## Exit Codes', ''];

	for (const [code, description] of Object.entries(schema.exitCodes)) {
		lines.push(`- \`${code}\` - ${description}`);
	}

	return lines.join('\n');
}

function buildAlternativeAccess(config: DashdashConfig): string {
	return `## Alternative Access Methods

- **Web Console:** ${config.webUrl}
- **API Documentation:** ${config.docsUrl}`;
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
	return str
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
		.toLowerCase();
}
