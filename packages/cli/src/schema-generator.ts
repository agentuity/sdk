import type { Command } from 'commander';
import type { CommandDefinition, SubcommandDefinition, CommandSchemas } from './types';
import { parseArgsSchema, parseOptionsSchema } from './schema-parser';
import * as z from 'zod';

export interface SchemaArgument {
	name: string;
	type: string;
	required: boolean;
	variadic: boolean;
	description?: string;
}

export interface SchemaOption {
	name: string;
	type: 'string' | 'number' | 'boolean';
	required: boolean;
	default?: unknown;
	description?: string;
	enum?: string[];
}

export interface SchemaPagination {
	supported: boolean;
	defaultLimit?: number;
	maxLimit?: number;
	parameters?: {
		limit?: string;
		offset?: string;
		cursor?: string;
	};
}

export interface SchemaCommand {
	name: string;
	description: string;
	aliases?: string[];
	arguments?: SchemaArgument[];
	options?: SchemaOption[];
	examples?: string[];
	response?: unknown;
	idempotent?: boolean;
	prerequisites?: string[];
	pagination?: SchemaPagination;
	tags?: string[];
	subcommands?: SchemaCommand[];
	requires?: {
		auth?: boolean;
		project?: boolean;
		org?: boolean;
		region?: boolean;
		regions?: boolean;
	};
	optional?: {
		auth?: boolean | string;
		project?: boolean;
		org?: boolean;
		region?: boolean;
	};
}

export interface CLISchema {
	name: string;
	version: string;
	description: string;
	exitCodes: Record<number, string>;
	globalOptions: SchemaOption[];
	commands: SchemaCommand[];
}

/**
 * Extract schema information from a CommandDefinition
 */
function extractCommandSchema(def: CommandDefinition): SchemaCommand {
	const schema: SchemaCommand = {
		name: def.name,
		description: def.description,
	};

	if (def.aliases) {
		schema.aliases = def.aliases;
	}

	// Extract examples if available
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).examples) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.examples = (def as any).examples;
	}

	// Extract idempotent marker
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).idempotent !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.idempotent = (def as any).idempotent;
	}

	// Extract prerequisites
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).prerequisites) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.prerequisites = (def as any).prerequisites;
	}

	// Extract pagination
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).pagination) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.pagination = (def as any).pagination;
	}

	// Extract tags
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).tags) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.tags = (def as any).tags;
	}

	// Extract requires/optional
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const d = def as any;
	if (d.requires) {
		schema.requires = {
			auth: d.requires.auth === true,
			project: d.requires.project === true,
			org: d.requires.org === true,
			region: d.requires.region === true,
			regions: d.requires.regions === true,
		};
	}
	if (d.optional) {
		schema.optional = {
			auth: d.optional.auth === true || typeof d.optional.auth === 'string',
			project: d.optional.project === true,
			org: d.optional.org === true,
			region: d.optional.region === true,
		};
	}

	// Extract subcommands recursively
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).subcommands) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.subcommands = ((def as any).subcommands as SubcommandDefinition[]).map((sub) =>
			extractSubcommandSchema(sub)
		);
	}

	return schema;
}

/**
 * Extract schema information from a SubcommandDefinition
 */
function extractSubcommandSchema(def: SubcommandDefinition): SchemaCommand {
	const schema: SchemaCommand = {
		name: def.name,
		description: def.description,
	};

	if (def.aliases) {
		schema.aliases = def.aliases;
	}

	// Extract examples if available
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).examples) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.examples = (def as any).examples;
	}

	// Extract idempotent marker
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).idempotent !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.idempotent = (def as any).idempotent;
	}

	// Extract prerequisites
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).prerequisites) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.prerequisites = (def as any).prerequisites;
	}

	// Extract pagination
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).pagination) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.pagination = (def as any).pagination;
	}

	// Extract tags
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((def as any).tags) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema.tags = (def as any).tags;
	}

	// Extract requires/optional
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const d = def as any;
	if (d.requires) {
		schema.requires = {
			auth: d.requires.auth === true,
			project: d.requires.project === true,
			org: d.requires.org === true,
			region: d.requires.region === true,
			regions: d.requires.regions === true,
		};
	}
	if (d.optional) {
		schema.optional = {
			auth: d.optional.auth === true || typeof d.optional.auth === 'string',
			project: d.optional.project === true,
			org: d.optional.org === true,
			region: d.optional.region === true,
		};
	}

	// Extract args and options from schema if available
	if (d.schema) {
		const schemas = d.schema as CommandSchemas;

		if (schemas.args) {
			const parsedArgs = parseArgsSchema(schemas.args);
			schema.arguments = parsedArgs.metadata.map((arg) => ({
				name: arg.name,
				type: arg.variadic ? 'array' : 'string',
				required: !arg.optional,
				variadic: arg.variadic,
			}));
		}

		if (schemas.options) {
			const parsedOptions = parseOptionsSchema(schemas.options);
			schema.options = parsedOptions.map((opt) => ({
				name: opt.name,
				type: opt.type,
				required: !opt.hasDefault,
				default: opt.defaultValue,
				description: opt.description,
			}));
		}

		if (schemas.response) {
			schema.response = z.toJSONSchema(schemas.response);
		}
	}

	// Extract nested subcommands recursively
	if (d.subcommands) {
		schema.subcommands = (d.subcommands as SubcommandDefinition[]).map((sub) =>
			extractSubcommandSchema(sub)
		);
	}

	return schema;
}

/**
 * Generate JSON schema for the entire CLI
 */
export function generateCLISchema(
	program: Command,
	commands: CommandDefinition[],
	version: string
): CLISchema {
	const schema: CLISchema = {
		name: 'agentuity',
		version,
		description: 'Agentuity CLI',
		exitCodes: {
			0: 'Success',
			1: 'General error',
			2: 'Validation error (invalid arguments or options)',
			3: 'Authentication error (login required or credentials invalid)',
			4: 'Resource not found (project, file, deployment, etc.)',
			5: 'Permission denied (insufficient access rights)',
			6: 'Network error (API unreachable or timeout)',
			7: 'File system error (file read/write failed)',
			8: 'User cancelled (operation aborted by user)',
		},
		globalOptions: [
			{
				name: 'config',
				type: 'string',
				required: false,
				description: 'Config file path',
			},
			{
				name: 'log-level',
				type: 'string',
				required: false,
				default: 'info',
				description: 'Log level',
				enum: ['debug', 'trace', 'info', 'warn', 'error'],
			},
			{
				name: 'log-timestamp',
				type: 'boolean',
				required: false,
				default: false,
				description: 'Show timestamps in log output',
			},
			{
				name: 'log-prefix',
				type: 'boolean',
				required: false,
				default: true,
				description: 'Show log level prefixes',
			},
			{
				name: 'org-id',
				type: 'string',
				required: false,
				description: 'Use a specific organization when performing operations',
			},
			{
				name: 'color-scheme',
				type: 'string',
				required: false,
				description: 'Color scheme: light or dark',
				enum: ['light', 'dark'],
			},
			{
				name: 'color',
				type: 'string',
				required: false,
				default: 'auto',
				description: 'Color output: auto, always, never',
				enum: ['auto', 'always', 'never'],
			},
			{
				name: 'error-format',
				type: 'string',
				required: false,
				default: 'text',
				description: 'Error output format: json or text',
				enum: ['json', 'text'],
			},
			{
				name: 'json',
				type: 'boolean',
				required: false,
				default: false,
				description: 'Output in JSON format (machine-readable)',
			},
			{
				name: 'quiet',
				type: 'boolean',
				required: false,
				default: false,
				description: 'Suppress non-essential output',
			},
			{
				name: 'no-progress',
				type: 'boolean',
				required: false,
				default: false,
				description: 'Disable progress indicators',
			},
			{
				name: 'explain',
				type: 'boolean',
				required: false,
				default: false,
				description: 'Show what the command would do without executing',
			},
			{
				name: 'dry-run',
				type: 'boolean',
				required: false,
				default: false,
				description: 'Execute command without making changes',
			},
			{
				name: 'validate',
				type: 'boolean',
				required: false,
				default: false,
				description: 'Validate arguments and options without executing',
			},
		],
		commands: commands.map(extractCommandSchema),
	};

	return schema;
}
