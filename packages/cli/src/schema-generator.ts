import type { Command } from 'commander';
import type { CommandDefinition, SubcommandDefinition, CommandSchemas } from './types';
import { exitCodeDescriptions } from './errors';
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
	type: 'string' | 'number' | 'boolean' | 'array' | 'optionalString';
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

export interface SchemaExample {
	command: string;
	description: string;
}

export interface SchemaCommand {
	name: string;
	description: string;
	aliases?: string[];
	arguments?: SchemaArgument[];
	options?: SchemaOption[];
	examples?: SchemaExample[];
	response?: unknown;
	idempotent?: boolean;
	prerequisites?: string[];
	pagination?: SchemaPagination;
	tags?: string[];
	skipSkill?: boolean;
	toplevel?: boolean;
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
 * Apply args, options, and response from a CommandSchemas to a SchemaCommand.
 * Shared by both extractCommandSchema and extractSubcommandSchema.
 */
function applySchemaFields(schema: SchemaCommand, schemas: CommandSchemas): void {
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

/**
 * Extract schema information from a CommandDefinition
 */
export function extractCommandSchema(def: CommandDefinition): SchemaCommand {
	const schema: SchemaCommand = {
		name: def.name,
		description: def.description,
	};

	if (def.aliases) {
		schema.aliases = def.aliases;
	}

	// Extract examples if available
	if ((def as any).examples) {
		schema.examples = (def as any).examples;
	}

	// Extract idempotent marker
	if ((def as any).idempotent !== undefined) {
		schema.idempotent = (def as any).idempotent;
	}

	// Extract prerequisites
	if ((def as any).prerequisites) {
		schema.prerequisites = (def as any).prerequisites;
	}

	// Extract pagination
	if ((def as any).pagination) {
		schema.pagination = (def as any).pagination;
	}

	// Extract tags
	if ((def as any).tags) {
		schema.tags = (def as any).tags;
	}

	// Extract skipSkill
	if ((def as any).skipSkill !== undefined) {
		schema.skipSkill = (def as any).skipSkill;
	}

	// Extract requires/optional
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
	if ((def as any).schema) {
		const schemas = (def as any).schema as CommandSchemas;
		applySchemaFields(schema, schemas);
	}

	// Extract subcommands recursively
	if ((def as any).subcommands) {
		schema.subcommands = ((def as any).subcommands as SubcommandDefinition[]).map((sub) =>
			extractSubcommandSchema(sub)
		);
	}

	return schema;
}

/**
 * Extract schema information from a SubcommandDefinition
 */
export function extractSubcommandSchema(def: SubcommandDefinition): SchemaCommand {
	const schema: SchemaCommand = {
		name: def.name,
		description: def.description,
	};

	if (def.aliases) {
		schema.aliases = def.aliases;
	}

	// Extract examples if available
	if ((def as any).examples) {
		schema.examples = (def as any).examples;
	}

	// Extract idempotent marker
	if ((def as any).idempotent !== undefined) {
		schema.idempotent = (def as any).idempotent;
	}

	// Extract prerequisites
	if ((def as any).prerequisites) {
		schema.prerequisites = (def as any).prerequisites;
	}

	// Extract pagination
	if ((def as any).pagination) {
		schema.pagination = (def as any).pagination;
	}

	// Extract tags
	if ((def as any).tags) {
		schema.tags = (def as any).tags;
	}

	// Extract skipSkill
	if ((def as any).skipSkill !== undefined) {
		schema.skipSkill = (def as any).skipSkill;
	}

	// Extract toplevel
	if ((def as any).toplevel !== undefined) {
		schema.toplevel = (def as any).toplevel;
	}

	// Extract requires/optional
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
		applySchemaFields(schema, schemas);
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
	_program: Command,
	commands: CommandDefinition[],
	version: string
): CLISchema {
	const schema: CLISchema = {
		name: 'agentuity',
		version,
		description: 'Agentuity CLI',
		exitCodes: { ...exitCodeDescriptions },
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
				description: 'Use a specific organization when performing operations (alias: --org)',
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
			{
				name: 'input',
				type: 'string',
				required: false,
				description: 'Pass arguments and options as a JSON object (for agents)',
			},
			{
				name: 'describe',
				type: 'boolean',
				required: false,
				default: false,
				description: 'Output command schema as JSON for agent introspection',
			},
			{
				name: 'fields',
				type: 'string',
				required: false,
				description:
					'Filter JSON output to specified fields (comma-separated, dot notation for nested)',
			},
		],
		commands: commands.map(extractCommandSchema),
	};

	return schema;
}
