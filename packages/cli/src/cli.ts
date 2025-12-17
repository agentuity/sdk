import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Command } from 'commander';
import type {
	CommandDefinition,
	SubcommandDefinition,
	CommandContext,
	ProjectConfig,
	Config,
	Requires,
	Optional,
	Logger,
	AuthData,
	GlobalOptions,
} from './types';
import { showBanner, generateBanner } from './banner';
import { requireAuth, optionalAuth, requireOrg, optionalOrg as selectOptionalOrg } from './auth';
import { listRegions, type RegionList } from '@agentuity/server';
import enquirer from 'enquirer';
import * as tui from './tui';
import { parseArgsSchema, parseOptionsSchema, buildValidationInput } from './schema-parser';
import { defaultProfileName, loadProjectConfig } from './config';
import { APIClient, getAPIBaseURL, type APIClient as APIClientType } from './api';
import { ErrorCode, ExitCode, createError, exitWithError } from './errors';
import { getCommand } from './command-prefix';
import { isValidateMode, outputValidation, type ValidationResult } from './output';
import { StructuredError } from '@agentuity/core';

const APIClientConfigError = StructuredError('APIClientConfigError');

function createAPIClient(baseCtx: CommandContext, config: Config | null): APIClient {
	try {
		const apiUrl = getAPIBaseURL(config);
		const apiClient = new APIClient(apiUrl, baseCtx.logger, config);

		if (!apiClient) {
			throw new APIClientConfigError({
				message: 'APIClient constructor returned null/undefined',
			});
		}

		if (typeof apiClient.request !== 'function') {
			throw new APIClientConfigError({
				message: 'APIClient instance is missing request method',
			});
		}

		return apiClient;
	} catch (error) {
		baseCtx.logger.error('Failed to create API client:', error);
		throw new APIClientConfigError({
			message: `API client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			cause: error,
		});
	}
}

/**
 * Execute handler or output validation result based on mode
 */
async function executeOrValidate(
	ctx: CommandContext,
	commandName: string,
	handler?: (ctx: CommandContext) => unknown | Promise<unknown>,
	hasResponseSchema?: boolean
): Promise<void> {
	if (isValidateMode(ctx.options)) {
		// In validate mode, just output success (validation already passed via Zod)
		const result: ValidationResult = {
			valid: true,
			command: commandName,
		};
		outputValidation(result, ctx.options);
	} else if (handler) {
		// Normal execution
		const result = await handler(ctx);

		// If --json flag is set
		if (ctx.options.json) {
			// If command has a response schema but returned nothing, that's an error
			if (hasResponseSchema && result === undefined) {
				const { createError, exitWithError, ErrorCode } = await import('./errors');
				exitWithError(
					createError(
						ErrorCode.INTERNAL_ERROR,
						`Command '${commandName}' declares a response schema but returned no data. This is a bug in the command implementation.`
					),
					ctx.logger,
					ctx.options.errorFormat
				);
			}

			// Output the result as JSON if we have data
			if (result !== undefined) {
				const { outputJSON } = await import('./output');
				outputJSON(result);
			}
		}
	}
}

/**
 * Handle validation error - output structured result in validate mode, otherwise log and exit
 */
function handleValidationError(
	error: unknown,
	commandName: string,
	baseCtx: { options: GlobalOptions; logger: Logger }
): never {
	if (error && typeof error === 'object' && 'issues' in error) {
		const issues = (error as { issues: Array<{ path: string[]; message: string }> }).issues;

		if (isValidateMode(baseCtx.options)) {
			// In validate mode, output structured validation result
			const result: ValidationResult = {
				valid: false,
				command: commandName,
				errors: issues.map((issue) => ({
					field: issue.path?.length ? issue.path.join('.') : 'unknown',
					message: issue.message,
				})),
			};
			outputValidation(result, baseCtx.options);
			process.exit(ExitCode.VALIDATION_ERROR);
		} else {
			// Use centralized error handling
			exitWithError(
				{
					code: ErrorCode.VALIDATION_FAILED,
					message: 'Validation error',
					details: {
						issues: issues.map((issue) => ({
							field: issue.path?.length ? issue.path.join('.') : 'unknown',
							message: issue.message,
						})),
					},
				},
				baseCtx.logger,
				baseCtx.options.errorFormat ?? 'text'
			);
		}
	}
	throw error;
}

type Normalized = {
	requiresAuth: boolean;
	optionalAuth: false | string;
	requiresProject: boolean;
	optionalProject: boolean;
	requiresAPIClient: boolean;
	requiresOrg: boolean;
	optionalOrg: boolean;
	requiresRegions: boolean;
	requiresRegion: boolean;
	optionalRegion: boolean;
};

function normalizeReqs(def: CommandDefinition | SubcommandDefinition): Normalized {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const d: any = def as any;
	const requires = d.requires as Requires | undefined;
	const optional = d.optional as Optional | undefined;

	const requiresAuth = requires?.auth === true;
	const optionalAuthValue = optional?.auth;
	const optionalAuth: false | string =
		optionalAuthValue === true ? 'Continue without authentication' : optionalAuthValue || false;

	const requiresProject = requires?.project === true;
	const optionalProject = optional?.project === true;

	const requiresOrg = requires?.org === true;
	const optionalOrg = optional?.org === true;
	const requiresRegions = requires?.regions === true;
	const requiresRegion = requires?.region === true;
	const optionalRegion = optional?.region === true;

	// Implicitly require apiClient if org or region is required or optional
	const requiresAPIClient =
		requires?.apiClient === true ||
		requiresOrg ||
		optionalOrg ||
		requiresRegion ||
		optionalRegion ||
		requiresRegions;

	return {
		requiresAuth,
		optionalAuth,
		requiresProject,
		optionalProject,
		requiresAPIClient,
		requiresOrg,
		optionalOrg,
		requiresRegions,
		requiresRegion,
		optionalRegion,
	};
}

function handleProjectConfigError(
	error: unknown,
	requiresProject: boolean,
	logger: Logger,
	errorFormat?: 'json' | 'text'
): never {
	if (
		requiresProject &&
		error &&
		typeof error === 'object' &&
		'name' in error &&
		error.name === 'ProjectConfigNotFoundExpection'
	) {
		exitWithError(
			createError(ErrorCode.PROJECT_NOT_FOUND, 'Invalid project folder', undefined, [
				'Use --dir to specify a different directory',
				'Change to a directory containing agentuity.json',
				`Run "${getCommand('project create')}" to create a new project`,
			]),
			logger,
			errorFormat ?? 'text'
		);
	}
	throw error;
}

/**
 * Prompt user to select a project from their available projects
 */
async function promptProjectSelection(
	baseCtx: CommandContext
): Promise<ProjectConfig | null> {
	const { logger, config } = baseCtx;

	// Need auth and API client to fetch projects
	const auth = await requireAuth(baseCtx);
	if (!auth) {
		return null;
	}

	const apiClient = createAPIClient(baseCtx, config);

	// Fetch available projects
	const { projectList } = await import('@agentuity/server');
	const projects = await projectList(apiClient);

	if (!projects || projects.length === 0) {
		tui.warning('No projects found. Please create a project first.');
		return null;
	}

	// Sort projects: prioritize those matching orgId in preferences
	const preferredOrgId = config?.preferences?.orgId;
	const sortedProjects = [...projects].sort((a, b) => {
		// Prioritize preferred org
		if (preferredOrgId) {
			if (a.orgId === preferredOrgId && b.orgId !== preferredOrgId) return -1;
			if (b.orgId === preferredOrgId && a.orgId !== preferredOrgId) return 1;
		}
		// Otherwise sort by name
		return a.name.localeCompare(b.name);
	});

	// Build select options with aligned formatting
	const { createPrompt } = tui;
	const prompt = createPrompt();

	// Calculate max name length for padding (with reasonable max)
	const maxNameLength = Math.min(
		40,
		Math.max(...sortedProjects.map((p) => p.name.length))
	);

	const selectedProjectId = await prompt.select<string>({
		message: 'Select a project',
		options: sortedProjects.map((p) => {
			// Truncate and pad name for alignment
			const displayName =
				p.name.length > maxNameLength
					? p.name.substring(0, maxNameLength - 1) + '…'
					: p.name.padEnd(maxNameLength);

			return {
				value: p.id,
				label: `${displayName}  ${tui.muted(p.id)}`,
			};
		}),
	});

	// Cleanup stdin after prompt to prevent hanging
	if (process.stdin.isTTY) {
		process.stdin.pause();
	}

	const selectedProject = sortedProjects.find((p) => p.id === selectedProjectId);
	if (!selectedProject) {
		return null;
	}

	// Convert to ProjectConfig format
	return {
		projectId: selectedProject.id,
		orgId: selectedProject.orgId,
		region: '', // Will be set by region resolution logic later
	};
}

export async function createCLI(version: string): Promise<Command> {
	const program = new Command();

	program
		.name('agentuity')
		.version(version, '-v, --version', 'Display version')
		.helpOption('-h, --help [json]', 'Display help (with optional JSON output)')
		.allowUnknownOption(false)
		.allowExcessArguments(false)
		.showHelpAfterError(true);

	program
		.option('--config <path>', 'Config file path')
		.option('--log-level <level>', 'Log level', process.env.AGENTUITY_LOG_LEVEL ?? 'info')
		.option('--log-timestamp', 'Show timestamps in log output', false)
		.option('--no-log-prefix', 'Hide log level prefixes', true)
		.option(
			'--org-id <id>',
			'Use a specific organization when performing operations',
			process.env.AGENTUITY_CLOUD_ORG_ID
		)
		.option('--color-scheme <scheme>', 'Color scheme: light or dark')
		.option('--color <mode>', 'Color output: auto, always, never', 'auto')
		.option('--error-format <format>', 'Error output format: json or text', 'text')
		.option('--json', 'Output in JSON format (machine-readable)', false)
		.option('--quiet', 'Suppress non-essential output', false)
		.option('--no-progress', 'Disable progress indicators', false)
		.option('--explain', 'Show what the command would do without executing', false)
		.option('--dry-run', 'Execute command without making changes', false)
		.option('--validate', 'Validate arguments and options without executing', false);

	const skipVersionCheckOption = program.createOption(
		'--skip-version-check',
		'Skip version compatibility check (dev only)'
	);
	skipVersionCheckOption.hideHelp();
	program.addOption(skipVersionCheckOption);

	program.action(() => {
		program.help();
	});

	// Handle unknown commands
	program.on('command:*', (operands: string[]) => {
		const unknownCommand = operands[0];
		console.error(`error: unknown command '${unknownCommand}'`);
		console.error();
		const availableCommands = program.commands.map((cmd) => cmd.name());
		if (availableCommands.length > 0) {
			console.error('Available commands:');
			availableCommands.forEach((name) => {
				console.error(`  ${name}`);
			});
		}
		console.error();
		console.error(`Run '${getCommand('--help')}' for usage information.`);
		process.exit(1);
	});

	// Custom error handling for argument/command parsing errors
	program.configureOutput({
		outputError: (str, write) => {
			// Suppress "unknown option '--help'" error since we handle help flags specially
			if (str.includes("unknown option '--help'")) {
				return;
			}
			// Intercept commander.js error messages
			if (str.includes('too many arguments') || str.includes('unknown command')) {
				// Extract potential command name from error context
				const match = str.match(/got (\d+)/);
				if (match) {
					write(`${tui.colorError('error: unknown command or subcommand')}\n`);
					write(tui.warn(`\nRun '${getCommand('--help')}' for available commands.\n`));
				} else {
					write(str);
				}
			} else if (str.startsWith('error:')) {
				// Colorize all error: lines in red
				write(tui.colorError(str));
			} else {
				write(str);
			}
		},
	});

	// Configure help to show only main command names, not aliases
	program.configureHelp({
		subcommandTerm: (cmd) => cmd.name(),
		formatHelp: (cmd, helper) => {
			// Check if JSON help was requested via --help=json (converted to --help json)
			const args = process.argv.slice(2);
			const helpIndex = args.findIndex((a) => a === '--help' || a === '-h');
			const wantsJson = helpIndex !== -1 && args[helpIndex + 1] === 'json';

			if (wantsJson) {
				// Generate JSON help for this specific command
				const commands = helper.visibleCommands(cmd);

				// Extract examples if available
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const cmdAny = cmd as any;
				const examples = cmdAny._examples || [];

				const cmdHelp = {
					name: cmd.name(),
					description: cmd.description(),
					usage: cmd.usage(),
					commands: commands.map((c) => ({
						name: c.name(),
						aliases: c.aliases(),
						description: c.description(),
					})),
					arguments: helper.visibleArguments(cmd).map((arg) => ({
						term: helper.argumentTerm(arg),
						description: helper.argumentDescription(arg),
					})),
					options: helper.visibleOptions(cmd).map((opt) => ({
						flags: helper.optionTerm(opt),
						description: helper.optionDescription(opt),
					})),
					globalOptions: helper.visibleGlobalOptions(cmd).map((opt) => ({
						flags: helper.optionTerm(opt),
						description: helper.optionDescription(opt),
					})),
					...(examples.length > 0 && { examples }),
				};
				return JSON.stringify(cmdHelp, null, 2);
			}

			const termWidth = helper.padWidth(cmd, helper);
			const itemIndentWidth = 2;
			const itemSeparatorWidth = 2;

			function formatItem(term: string, description: string) {
				if (description) {
					return `${' '.repeat(itemIndentWidth)}${tui.colorInfo(
						term.padEnd(termWidth + itemSeparatorWidth)
					)}${tui.colorMuted(description)}`;
				}
				return term;
			}

			// Format each section (show banner for root command)
			let output = '';

			// Show banner (full for root, compact for subcommands)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const isRootCommand = !(cmd as any).parent;
			if (isRootCommand) {
				output += `${generateBanner(version)}\n\n`;
			} else {
				output += `${generateBanner(version, true)}\n`;
			}

			// Description
			const description = helper.commandDescription(cmd);
			if (description) {
				output += `${tui.colorInfo(description)}\n`;
			}

			// Usage
			const usage = helper.commandUsage(cmd);
			if (usage) {
				output += `\n${tui.colorPrimary('\x1b[4mUsage\x1b[24m')}\n  ${tui.bold(tui.colorPrimary(usage))}\n`;
			}

			// Arguments
			const argumentList = helper.visibleArguments(cmd).map((argument) => {
				return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
			});
			if (argumentList.length > 0) {
				output += `\n${tui.colorPrimary('\x1b[4mArguments\x1b[24m')}\n${argumentList.join('\n')}\n`;
			}

			// Options
			const optionList = helper.visibleOptions(cmd).map((option) => {
				return formatItem(helper.optionTerm(option), helper.optionDescription(option));
			});
			if (optionList.length > 0) {
				output += `\n${tui.colorPrimary('\x1b[4mOptions\x1b[24m')}\n${optionList.join('\n')}\n`;
			}

			// Global options
			const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
				return formatItem(helper.optionTerm(option), helper.optionDescription(option));
			});
			if (globalOptionList.length > 0) {
				output += `\n${tui.colorPrimary('\x1b[4mGlobal Options\x1b[24m')}\n${globalOptionList.join('\n')}\n`;
			}

			// Commands
			const commandList = helper.visibleCommands(cmd).map((cmd) => {
				return formatItem(helper.subcommandTerm(cmd), helper.subcommandDescription(cmd));
			});
			if (commandList.length > 0) {
				output += `\n${tui.colorPrimary('\x1b[4mCommands\x1b[24m')}\n${commandList.join('\n')}\n`;
			}

			return output;
		},
	});

	return program;
}

async function getRegion(regions: RegionList): Promise<string> {
	if (regions.length === 1) {
		return regions[0].region;
	} else {
		const response = await enquirer.prompt<{ region: string }>({
			type: 'select',
			name: 'region',
			message: 'Select a cloud region:',
			choices: regions.map((r) => ({
				name: r.region,
				message: `${r.description.padEnd(15, ' ')} ${tui.muted(r.region)}`,
			})),
		});
		return response.region;
	}
}

interface ResolveRegionOptions {
	options: Record<string, unknown>;
	apiClient: APIClientType;
	logger: Logger;
	required: boolean;
	region?: string;
}

async function resolveRegion(opts: ResolveRegionOptions): Promise<string | undefined> {
	const { options, apiClient, logger, required } = opts;

	// Fetch regions
	const regions = await listRegions(apiClient);

	// No regions available
	if (regions.length === 0) {
		if (required) {
			const errorFormat = (options as Record<string, unknown>).errorFormat as
				| 'json'
				| 'text'
				| undefined;
			exitWithError(
				createError(ErrorCode.NO_REGIONS_AVAILABLE, 'No cloud regions available', undefined, [
					'Contact support if you need access to cloud regions',
				]),
				logger,
				errorFormat ?? 'text'
			);
		}
		return undefined;
	}

	// Check if region was provided via flag
	let region = opts.region ?? (options.region as string | undefined);

	// Validate --region flag if provided
	if (region) {
		const found = regions.find((r) => r.region === region);
		if (!found) {
			const errorFormat = (options as Record<string, unknown>).errorFormat as
				| 'json'
				| 'text'
				| undefined;
			exitWithError(
				createError(
					ErrorCode.REGION_NOT_FOUND,
					`Invalid region '${region}'`,
					{ region, availableRegions: regions.map((r) => r.region) },
					[`Use one of: ${regions.map((r) => r.region).join(', ')}`]
				),
				logger,
				errorFormat ?? 'text'
			);
		}
		return region;
	}

	// Auto-select if only one region available
	if (regions.length === 1) {
		region = regions[0].region;
		if (!process.stdin.isTTY) {
			logger.trace('auto-selected region (non-TTY): %s', region);
		}
		return region;
	}

	// Check for AGENTUITY_REGION environment variable
	const envRegion = process.env.AGENTUITY_REGION;
	if (envRegion) {
		// Validate that the env region is in the available regions
		const matchingRegion = regions.find((r) => r.region === envRegion);
		if (matchingRegion) {
			return matchingRegion.region;
		}
		// If not valid, fall through to error/prompt
	}

	// No flag provided - handle TTY vs non-TTY
	if (required && !process.stdin.isTTY) {
		const errorFormat = (options as Record<string, unknown>).errorFormat as
			| 'json'
			| 'text'
			| undefined;
		exitWithError(
			createError(
				ErrorCode.REGION_REQUIRED,
				'--region flag is required in non-interactive mode',
				{ availableRegions: regions.map((r) => r.region) },
				[
					`Use --region with one of: ${regions.map((r) => r.region).join(', ')}`,
					`Or set AGENTUITY_REGION environment variable`,
				]
			),
			logger,
			errorFormat ?? 'text'
		);
	}

	if (process.stdin.isTTY) {
		// Interactive mode - prompt user
		region = await getRegion(regions);
		return region;
	}

	// Non-interactive, optional region - return undefined
	return undefined;
}

async function registerSubcommand(
	parent: Command,
	subcommand: SubcommandDefinition,
	baseCtx: CommandContext,
	hidden?: boolean
): Promise<void> {
	const cmd = parent.command(subcommand.name, { hidden }).description(subcommand.description);

	cmd.helpOption('-h, --help [json]', 'Display help (with optional JSON output)');

	if (subcommand.aliases) {
		cmd.aliases(subcommand.aliases);
	}

	// Add examples to help text (skip in JSON mode)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const examples = (subcommand as any).examples as
		| Array<{ command: string; description: string }>
		| undefined;
	if (examples && examples.length > 0) {
		// Store examples for JSON help generation
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(cmd as any)._examples = examples;

		// Add formatted examples to text help
		cmd.addHelpText('after', () => {
			// Skip examples in JSON mode
			const args = process.argv.slice(2);
			const helpIndex = args.findIndex((a) => a === '--help' || a === '-h');
			if (helpIndex !== -1 && args[helpIndex + 1] === 'json') {
				return '';
			}

			const maxLength = Math.max(...examples.map((ex) => ex.command.length));
			const formatted = examples.map((ex) => {
				const padding = ' '.repeat(maxLength - ex.command.length + 1);
				return `  ${tui.colorPrimary(ex.command)}${padding}${tui.muted('#')} ${tui.muted(ex.description)}`;
			});
			return `\n${tui.colorPrimary('\x1b[4mExamples:\x1b[24m')}\n` + formatted.join('\n');
		});
	}

	// Check if this subcommand has its own subcommands (nested subcommands)
	const subDef = subcommand as unknown as { subcommands?: SubcommandDefinition[] };
	if (subDef.subcommands && subDef.subcommands.length > 0) {
		// Register nested subcommands recursively
		for (const nestedSub of subDef.subcommands) {
			await registerSubcommand(cmd, nestedSub, baseCtx);
		}

		// Add a virtual 'help' subcommand
		cmd.command('help', { hidden: true })
			.description('Display help')
			.action(() => {
				cmd.help();
			});

		// Don't add options to parent commands - only to leaf commands
		return;
	}

	const {
		requiresProject,
		optionalProject,
		requiresOrg,
		optionalOrg,
		requiresRegion,
		optionalRegion,
	} = normalizeReqs(subcommand);

	if (requiresProject || optionalProject) {
		cmd.option('--dir <path>', 'project directory (default: current directory)');
	}

	if (requiresOrg || optionalOrg) {
		cmd.option('--org-id <id>', 'organization ID');
	}

	if (requiresRegion || optionalRegion) {
		cmd.option('--region <region>', 'cloud region');
	}

	if (subcommand.schema?.args) {
		const parsed = parseArgsSchema(subcommand.schema.args);
		for (const argMeta of parsed.metadata) {
			let argSyntax: string;
			if (argMeta.variadic) {
				argSyntax = argMeta.optional ? `[${argMeta.name}...]` : `<${argMeta.name}...>`;
			} else {
				argSyntax = argMeta.optional ? `[${argMeta.name}]` : `<${argMeta.name}>`;
			}
			cmd.argument(argSyntax);
		}
	}

	// Track if projectId is defined in schema options
	let hasProjectIdInSchema = false;

	if (subcommand.schema?.options) {
		const parsed = parseOptionsSchema(subcommand.schema.options);
		for (const opt of parsed) {
			const flag = opt.name
				.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
				.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
				.toLowerCase();
			
			// Track if this schema defines projectId (as 'projectId' or 'project-id')
			if (opt.name === 'projectId' || opt.name === 'project-id' || flag === 'project-id') {
				hasProjectIdInSchema = true;
			}

			const desc = opt.description || '';
			// Add short flag alias for verbose
			const flagSpec = flag === 'verbose' ? `-v, --${flag}` : `--${flag}`;
			if (opt.type === 'boolean') {
				if (opt.hasDefault) {
					const defaultValue =
						typeof opt.defaultValue === 'function' ? opt.defaultValue() : opt.defaultValue;
					cmd.option(`--no-${flag}`, desc);
					cmd.option(flagSpec, desc, defaultValue);
				} else {
					cmd.option(flagSpec, desc);
				}
			} else if (opt.type === 'number') {
				const numDefault = opt.hasDefault
					? typeof opt.defaultValue === 'function'
						? opt.defaultValue()
						: opt.defaultValue
					: undefined;
				const numDesc =
					opt.hasDefault && numDefault !== undefined
						? `${desc} (default: ${numDefault})`
						: desc;
				cmd.option(`${flagSpec} <${opt.name}>`, numDesc, parseFloat);
			} else if (opt.type === 'array') {
				const arrayDefault = opt.hasDefault
					? typeof opt.defaultValue === 'function'
						? opt.defaultValue()
						: opt.defaultValue
					: undefined;
				const arrayDesc =
					opt.hasDefault && Array.isArray(arrayDefault) && arrayDefault.length > 0
						? `${desc} (default: ${JSON.stringify(arrayDefault)})`
						: desc;
				cmd.option(
					`${flagSpec} <${opt.name}>`,
					arrayDesc,
					(value: string, previous: string[]) => (previous ?? []).concat([value])
				);
			} else {
				const strDefault = opt.hasDefault
					? typeof opt.defaultValue === 'function'
						? opt.defaultValue()
						: opt.defaultValue
					: undefined;
				let strDesc = desc;
				if (opt.enumValues && opt.enumValues.length > 0) {
					strDesc += ` (${opt.enumValues.join(', ')})`;
				}
				if (opt.hasDefault && strDefault !== undefined) {
					strDesc += ` (default: ${JSON.stringify(strDefault)})`;
				}
				cmd.option(`${flagSpec} <${opt.name}>`, strDesc);
			}
		}
	}

	// Add --project-id if command requires/optional project and doesn't define it in schema
	if ((requiresProject || optionalProject) && !hasProjectIdInSchema) {
		cmd.option('--project-id <id>', 'project ID (alternative to --dir)');
	}

	cmd.action(async (...rawArgs: unknown[]) => {
		const cmdObj = rawArgs[rawArgs.length - 1] as { opts: () => Record<string, unknown> };
		const options = cmdObj.opts();
		const args = rawArgs.slice(0, -1);

		if (subcommand.banner) {
			showBanner();
		}

		const normalized = normalizeReqs(subcommand);

		let project: ProjectConfig | undefined;
		let projectDir: string | undefined;
		const dirNeeded = normalized.requiresProject || normalized.optionalProject;

		if (dirNeeded) {
			const projectId = options.projectId as string | undefined;

			// If --project-id is provided, fetch project details from API
			if (projectId) {
				try {
					const auth = await requireAuth(baseCtx);
					if (auth) {
						const apiClient = createAPIClient(baseCtx, baseCtx.config);
						const { projectGet } = await import('@agentuity/server');
						const projectDetails = await projectGet(apiClient, { id: projectId, mask: true });
						project = {
							projectId: projectDetails.id,
							orgId: projectDetails.orgId,
							region: projectDetails.cloudRegion || '',
						};
					}
				} catch (error) {
					if (normalized.requiresProject) {
						exitWithError(
							createError(
								ErrorCode.PROJECT_NOT_FOUND,
								`Project not found: ${projectId}`,
								undefined,
								['Verify the project ID is correct', `Run "${getCommand('project list')}" to see available projects`]
							),
							baseCtx.logger,
							baseCtx.options.errorFormat
						);
					}
				}
			} else {
				// Try to load from directory
				const dir = (options.dir as string | undefined) ?? process.cwd();
				projectDir = dir;
				if (projectDir.startsWith('~/')) {
					projectDir = projectDir.replace('~/', homedir());
				}
				projectDir = resolve(projectDir);
				try {
					project = await loadProjectConfig(dir, baseCtx.config);
				} catch (error) {
					if (normalized.requiresProject) {
						if (
							error &&
							typeof error === 'object' &&
							'name' in error &&
							error.name === 'ProjectConfigNotFoundExpection'
						) {
							// If TTY is available, prompt user to select a project
							const hasTTY = process.stdin.isTTY && process.stdout.isTTY;

							if (hasTTY) {
								// Try to prompt for project selection
								try {
									const selectedProject = await promptProjectSelection(baseCtx);
									if (selectedProject) {
										// Set the project ID in options so it can be used by the command
										(options as Record<string, unknown>).projectId = selectedProject.projectId;
										project = selectedProject;
									}
								} catch (promptError) {
									// If prompting fails, fall through to the original error
									baseCtx.logger.trace('Project selection prompt failed: %s', promptError);
								}
							}

							if (!project) {
								exitWithError(
									createError(ErrorCode.PROJECT_NOT_FOUND, 'Invalid project folder', undefined, [
										'Use --dir to specify a different directory',
										'Use --project-id to specify a project by ID',
										'Change to a directory containing agentuity.json',
										`Run "${getCommand('project create')}" to create a new project`,
									]),
									baseCtx.logger,
									baseCtx.options.errorFormat
								);
							}
						} else {
							throw error;
						}
					}
					// For optional projects, silently continue without project config
				}
			}
		}

		if (normalized.requiresAuth) {
			// Create apiClient before requireAuth since login command needs it
			if (normalized.requiresAPIClient) {
				(baseCtx as Record<string, unknown>).apiClient = createAPIClient(
					baseCtx,
					baseCtx.config ?? null
				);
			}

			const auth = await requireAuth(baseCtx as CommandContext<undefined>);

			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
						config: {
							...(baseCtx.config ?? {}),
							auth: {
								api_key: auth.apiKey,
								user_id: auth.userId,
								expires: auth.expires.getTime(),
							},
						},
						auth,
					};
					if (project || projectDir) {
						if (project) {
							ctx.project = project;
						}
						ctx.projectDir = projectDir;
					}
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					if (normalized.requiresAPIClient) {
						// Recreate apiClient with auth credentials
						ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
					}
					if (normalized.requiresOrg) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if (normalized.optionalOrg && ctx.auth) {
						ctx.orgId = await selectOptionalOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
						const apiClient: APIClientType = ctx.apiClient as APIClientType;
						const region = await tui.spinner({
							message: 'Fetching cloud regions',
							clearOnSuccess: true,
							callback: async () => {
								return resolveRegion({
									options: options as Record<string, unknown>,
									apiClient,
									logger: baseCtx.logger,
									required: !!normalized.requiresRegion,
									region: project?.region,
								});
							},
						});
						if (region) {
							ctx.region = region;
						}
					}
					await executeOrValidate(
						ctx as CommandContext,
						`${parent.name()} ${subcommand.name}`,
						subcommand.handler,
						!!subcommand.schema?.response
					);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						handleValidationError(error, `${parent.name()} ${subcommand.name}`, baseCtx);
					}
					handleProjectConfigError(
						error,
						normalized.requiresProject,
						baseCtx.logger,
						baseCtx.options.errorFormat
					);
				}
			} else {
				const ctx: Record<string, unknown> = {
					...baseCtx,
					config: baseCtx.config
						? {
								...baseCtx.config,
								name: baseCtx.config.name ?? defaultProfileName,
								auth: {
									api_key: auth.apiKey,
									user_id: auth.userId,
									expires: auth.expires.getTime(),
								},
							}
						: null,
					auth,
				};
				if (project || projectDir) {
					if (project) {
						ctx.project = project;
					}
					ctx.projectDir = projectDir;
				}
				if (normalized.requiresAPIClient) {
					// Recreate apiClient with auth credentials
					ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
				}
				if (normalized.requiresOrg) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if (normalized.optionalOrg && ctx.auth) {
					ctx.orgId = await selectOptionalOrg(
						ctx as CommandContext & { apiClient: APIClientType }
					);
				}
				if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const region = await tui.spinner('Fetching cloud regions', async () => {
						return resolveRegion({
							options: options as Record<string, unknown>,
							apiClient,
							logger: baseCtx.logger,
							required: !!normalized.requiresRegion,
							region: project?.region,
						});
					});
					if (region) {
						ctx.region = region;
					}
				}
				if (subcommand.handler) {
					const result = await subcommand.handler(ctx as CommandContext);

					// If --json flag is set
					if (baseCtx.options.json) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const hasResponseSchema = !!(subcommand as any).schema?.response;

						// If command has a response schema but returned nothing, that's an error
						if (hasResponseSchema && result === undefined) {
							const { createError, exitWithError, ErrorCode } = await import('./errors');
							exitWithError(
								createError(
									ErrorCode.INTERNAL_ERROR,
									`Command '${parent.name()} ${subcommand.name}' declares a response schema but returned no data. This is a bug in the command implementation.`
								),
								baseCtx.logger,
								baseCtx.options.errorFormat
							);
						}

						// Output the result as JSON if we have data
						if (result !== undefined) {
							const { outputJSON } = await import('./output');
							outputJSON(result);
						}
					}
				}
			}
		} else if (normalized.optionalAuth) {
			const continueText =
				typeof normalized.optionalAuth === 'string' ? normalized.optionalAuth : undefined;

			// Create apiClient before optionalAuth since login command needs it
			if (normalized.requiresAPIClient) {
				(baseCtx as Record<string, unknown>).apiClient = createAPIClient(
					baseCtx,
					baseCtx.config ?? null
				);
			}

			const auth = await optionalAuth(baseCtx as CommandContext<undefined>, continueText);

			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
						config: auth
							? {
									...(baseCtx.config ?? {}),
									auth: {
										api_key: auth.apiKey,
										user_id: auth.userId,
										expires: auth.expires.getTime(),
									},
								}
							: baseCtx.config,
						auth,
					};
					if (project || projectDir) {
						if (project) {
							ctx.project = project;
						}
						ctx.projectDir = projectDir;
					}
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					if (normalized.requiresAPIClient) {
						// Recreate apiClient with auth credentials
						ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
					}
					baseCtx.logger.trace(
						'optionalAuth path: org=%s, region=%s, hasApiClient=%s, hasAuth=%s',
						normalized.optionalOrg,
						normalized.optionalRegion,
						!!ctx.apiClient,
						!!auth
					);
					if (normalized.requiresOrg && ctx.apiClient) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if (normalized.optionalOrg && ctx.apiClient && auth) {
						ctx.orgId = await selectOptionalOrg(
							ctx as CommandContext & { apiClient?: APIClientType; auth?: AuthData }
						);
						baseCtx.logger.trace('selected orgId: %s', ctx.orgId);
					}
					if (
						(normalized.requiresRegion || normalized.optionalRegion) &&
						ctx.apiClient &&
						auth
					) {
						const apiClient: APIClientType = ctx.apiClient as APIClientType;
						const region = await resolveRegion({
							options: options as Record<string, unknown>,
							apiClient,
							logger: baseCtx.logger,
							required: !!normalized.requiresRegion,
							region: project?.region,
						});
						if (region) {
							ctx.region = region;
						}
					}
					await executeOrValidate(
						ctx as CommandContext,
						`${parent.name()} ${subcommand.name}`,
						subcommand.handler,
						!!subcommand.schema?.response
					);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						handleValidationError(error, `${parent.name()} ${subcommand.name}`, baseCtx);
					}
					handleProjectConfigError(
						error,
						normalized.requiresProject,
						baseCtx.logger,
						baseCtx.options.errorFormat
					);
				}
			} else {
				const ctx: Record<string, unknown> = {
					...baseCtx,
					config: auth
						? {
								...(baseCtx.config ?? {}),
								auth: {
									api_key: auth.apiKey,
									user_id: auth.userId,
									expires: auth.expires.getTime(),
								},
							}
						: baseCtx.config,
					auth,
				};
				if (project || projectDir) {
					if (project) {
						ctx.project = project;
					}
					ctx.projectDir = projectDir;
				}
				if (normalized.requiresAPIClient) {
					// Recreate apiClient with auth credentials if auth was provided
					ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
				}
				if (normalized.requiresOrg && ctx.apiClient) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if (normalized.optionalOrg && ctx.apiClient) {
					ctx.orgId = await selectOptionalOrg(
						ctx as CommandContext & { apiClient?: APIClientType; auth?: AuthData }
					);
				}
				if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const region = await resolveRegion({
						options: options as Record<string, unknown>,
						apiClient,
						logger: baseCtx.logger,
						required: !!normalized.requiresRegion,
					});
					if (region) {
						ctx.region = region;
					}
				}
				if (subcommand.handler) {
					const result = await subcommand.handler(ctx as CommandContext);

					// If --json flag is set
					if (baseCtx.options.json) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const hasResponseSchema = !!(subcommand as any).schema?.response;

						// If command has a response schema but returned nothing, that's an error
						if (hasResponseSchema && result === undefined) {
							const { createError, exitWithError, ErrorCode } = await import('./errors');
							exitWithError(
								createError(
									ErrorCode.INTERNAL_ERROR,
									`Command '${parent.name()} ${subcommand.name}' declares a response schema but returned no data. This is a bug in the command implementation.`
								),
								baseCtx.logger,
								baseCtx.options.errorFormat
							);
						}

						// Output the result as JSON if we have data
						if (result !== undefined) {
							const { outputJSON } = await import('./output');
							outputJSON(result);
						}
					}
				}
			}
		} else {
			if (subcommand.schema) {
				try {
					const input = buildValidationInput(subcommand.schema, args, options);
					const ctx: Record<string, unknown> = {
						...baseCtx,
					};
					if (project || projectDir) {
						if (project) {
							ctx.project = project;
						}
						ctx.projectDir = projectDir;
					}
					if (subcommand.schema.args) {
						ctx.args = subcommand.schema.args.parse(input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = subcommand.schema.options.parse(input.options);
					}
					if (normalized.requiresAPIClient && !ctx.apiClient) {
						ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
					}
					if (normalized.requiresOrg && ctx.apiClient) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					if (normalized.optionalOrg && ctx.apiClient && ctx.auth) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType }
						);
					}
					await executeOrValidate(
						ctx as CommandContext,
						`${parent.name()} ${subcommand.name}`,
						subcommand.handler,
						!!subcommand.schema?.response
					);
				} catch (error) {
					if (error && typeof error === 'object' && 'issues' in error) {
						handleValidationError(error, `${parent.name()} ${subcommand.name}`, baseCtx);
					}
					handleProjectConfigError(
						error,
						normalized.requiresProject,
						baseCtx.logger,
						baseCtx.options.errorFormat
					);
				}
			} else {
				const ctx: Record<string, unknown> = {
					...baseCtx,
				};
				if (project || projectDir) {
					if (project) {
						ctx.project = project;
					}
					ctx.projectDir = projectDir;
				}
				if (normalized.requiresAPIClient && !ctx.apiClient) {
					ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
				}
				if (normalized.requiresOrg && ctx.apiClient) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if (normalized.optionalOrg && ctx.apiClient && ctx.auth) {
					ctx.orgId = await requireOrg(ctx as CommandContext & { apiClient: APIClientType });
				}
				if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const region = await resolveRegion({
						options: options as Record<string, unknown>,
						apiClient,
						logger: baseCtx.logger,
						required: !!normalized.requiresRegion,
						region: project?.region,
					});
					if (region) {
						ctx.region = region;
					}
				}
				if (subcommand.handler) {
					const result = await subcommand.handler(ctx as CommandContext);

					// If --json flag is set
					if (baseCtx.options.json) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const hasResponseSchema = !!(subcommand as any).schema?.response;

						// If command has a response schema but returned nothing, that's an error
						if (hasResponseSchema && result === undefined) {
							const { createError, exitWithError, ErrorCode } = await import('./errors');
							exitWithError(
								createError(
									ErrorCode.INTERNAL_ERROR,
									`Command '${parent.name()} ${subcommand.name}' declares a response schema but returned no data. This is a bug in the command implementation.`
								),
								baseCtx.logger,
								baseCtx.options.errorFormat
							);
						}

						// Output the result as JSON if we have data
						if (result !== undefined) {
							const { outputJSON } = await import('./output');
							outputJSON(result);
						}
					}
				}
			}
		}
	});
}

export async function registerCommands(
	program: Command,
	commands: CommandDefinition[],
	baseCtx: CommandContext
): Promise<void> {
	for (const cmdDef of commands) {
		if (cmdDef.subcommands) {
			const cmd = program
				.command(cmdDef.name, { hidden: cmdDef.hidden })
				.description(cmdDef.description);

			cmd.helpOption('-h, --help [json]', 'Display help (with optional JSON output)');

			if (cmdDef.aliases) {
				cmd.aliases(cmdDef.aliases);
			}

			// Add examples to help text (skip in JSON mode)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const examples = (cmdDef as any).examples as
				| Array<{ command: string; description: string }>
				| undefined;
			if (examples && examples.length > 0) {
				// Store examples for JSON help generation
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(cmd as any)._examples = examples;

				// Add formatted examples to text help
				cmd.addHelpText('after', () => {
					// Skip examples in JSON mode
					const args = process.argv.slice(2);
					const helpIndex = args.findIndex((a) => a === '--help' || a === '-h');
					if (helpIndex !== -1 && args[helpIndex + 1] === 'json') {
						return '';
					}

					const maxLength = Math.max(...examples.map((ex) => ex.command.length));
					const formatted = examples.map((ex) => {
						const padding = ' '.repeat(maxLength - ex.command.length + 1);
						return `  ${tui.colorPrimary(ex.command)}${padding}${tui.muted('#')} ${tui.muted(ex.description)}`;
					});
					return `\n${tui.colorPrimary('\x1b[4mExamples:\x1b[24m')}\n` + formatted.join('\n');
				});
			}

			if (cmdDef.handler) {
				cmd.action(async () => {
					if (cmdDef.banner) {
						showBanner();
					}

					const normalized = normalizeReqs(cmdDef);
					if (normalized.requiresAuth) {
						// Create apiClient before requireAuth since login command needs it
						if (normalized.requiresAPIClient) {
							(baseCtx as Record<string, unknown>).apiClient = createAPIClient(
								baseCtx,
								baseCtx.config ?? null
							);
						}

						const auth = await requireAuth(baseCtx as CommandContext<undefined>);
						const ctx: Record<string, unknown> = {
							...baseCtx,
							config: baseCtx.config
								? {
										...baseCtx.config,
										name: baseCtx.config.name ?? defaultProfileName,
										auth: {
											api_key: auth.apiKey,
											user_id: auth.userId,
											expires: auth.expires.getTime(),
										},
									}
								: null,
							auth,
						};
						if (normalized.requiresAPIClient) {
							// Recreate apiClient with auth credentials
							ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
						}
						if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
							const apiClient: APIClientType = ctx.apiClient as APIClientType;
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								apiClient,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
							});
							if (region) {
								ctx.region = region;
							}
						}
						await cmdDef.handler!(ctx as CommandContext);
					} else if (normalized.optionalAuth) {
						const continueText =
							typeof normalized.optionalAuth === 'string'
								? normalized.optionalAuth
								: undefined;

						// Create apiClient before optionalAuth since login command needs it
						if (normalized.requiresAPIClient) {
							(baseCtx as Record<string, unknown>).apiClient = createAPIClient(
								baseCtx,
								baseCtx.config ?? null
							);
						}

						const auth = await optionalAuth(
							baseCtx as CommandContext<undefined>,
							continueText
						);
						const ctx: Record<string, unknown> = {
							...baseCtx,
							config: auth
								? baseCtx.config
									? {
											...baseCtx.config,
											auth: {
												api_key: auth.apiKey,
												user_id: auth.userId,
												expires: auth.expires.getTime(),
											},
										}
									: {
											auth: {
												api_key: auth.apiKey,
												user_id: auth.userId,
												expires: auth.expires.getTime(),
											},
										}
								: baseCtx.config,
							auth,
						};
						if (normalized.requiresAPIClient) {
							// Recreate apiClient with auth credentials if auth was provided
							ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
						}
						if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
							const apiClient: APIClientType = ctx.apiClient as APIClientType;
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								apiClient,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
							});
							if (region) {
								ctx.region = region;
							}
						}
						await cmdDef.handler!(ctx as CommandContext);
					} else {
						const ctx: Record<string, unknown> = {
							...baseCtx,
						};
						if (normalized.requiresAPIClient && !(ctx as CommandContext).apiClient) {
							ctx.apiClient = createAPIClient(baseCtx, baseCtx.config);
						}
						if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
							const apiClient = ctx.apiClient as APIClientType;
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								apiClient,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
							});
							if (region) {
								ctx.region = region;
							}
						}
						await cmdDef.handler!(ctx as CommandContext);
					}
				});
			} else {
				cmd.action(() => cmd.help());
			}

			for (const sub of cmdDef.subcommands) {
				await registerSubcommand(cmd, sub, baseCtx);
			}

			// Add a virtual 'help' subcommand for commands with subcommands
			cmd.command('help', { hidden: true })
				.description('Display help')
				.action(() => {
					cmd.help();
				});
		} else {
			await registerSubcommand(
				program,
				cmdDef as unknown as SubcommandDefinition,
				baseCtx,
				cmdDef.hidden
			);
		}
	}
}
