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
import { getExecutingAgent } from './agent-detection';
import {
	requireAuth,
	optionalAuth,
	requireOrg,
	optionalOrg as selectOptionalOrg,
	hasPrefixedResourceId,
	resolveOrgIdWithoutPrompt,
} from './auth';
import { type RegionList, ValidationOutputError } from '@agentuity/server';
import { fetchRegionsWithCache } from './regions';
import enquirer from 'enquirer';
import * as tui from './tui';
import { parseArgsSchema, parseOptionsSchema, buildValidationInputAsync } from './schema-parser';
import { defaultProfileName, loadProjectConfig, saveProjectId, saveRegion } from './config';
import { APIClient, getAPIBaseURL, getAppBaseURL, type APIClient as APIClientType } from './api';
import { ErrorCode, ExitCode, createError, exitWithError, formatErrorJSON } from './errors';
import { getCommand } from './command-prefix';
import {
	getOutputOptions,
	isValidateMode,
	outputValidation,
	type ValidationResult,
} from './output';
import { StructuredError } from '@agentuity/core';
import { setProgram } from './program-ref';
import { generateIntroPrompt } from './cmd/ai/intro';
import {
	getCachedProject,
	getResourceInfo,
	setCachedProject,
	type ResourceType,
	hasAgentSeenIntro,
	markAgentIntroSeen,
} from './cache';

/**
 * Check if an error is a CLI input validation error (Zod error from schema parsing),
 * and not an API response validation error (ValidationOutputError).
 */
function isCLIValidationError(error: unknown): boolean {
	if (!error || typeof error !== 'object' || !('issues' in error)) {
		return false;
	}
	// ValidationOutputError from API responses should NOT be treated as CLI validation errors
	if (error instanceof ValidationOutputError) {
		return false;
	}
	// Check for Zod error structure (has name 'ZodError' or is from SchemaValidationError)
	return true;
}

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

type WebUrlSpec = string | ((ctx: CommandContext) => string | undefined | null);

function resolveWebUrl(ctx: CommandContext, spec?: WebUrlSpec): string | undefined {
	if (!spec) return undefined;

	const raw = typeof spec === 'function' ? spec(ctx) : spec;
	if (!raw) return undefined;

	if (raw.startsWith('http://') || raw.startsWith('https://')) {
		return raw;
	}

	const appBase = getAppBaseURL(ctx.config ?? null).replace(/\/$/, '');
	const path = raw.startsWith('/') ? raw : `/${raw}`;
	return `${appBase}${path}`;
}

function maybeRenderWebLink(ctx: CommandContext, spec?: WebUrlSpec): void {
	if (ctx.options.json) return;
	if (isValidateMode(ctx.options)) return;
	if (getExecutingAgent()) return;

	const url = resolveWebUrl(ctx, spec);
	if (!url) return;

	if (tui.supportsHyperlinks()) {
		tui.output(tui.muted(`→ ${tui.link(url, 'View on the web', '')}`));
	} else {
		tui.output(tui.muted(`→ View on the web: ${url}`));
	}
	tui.newline();
}

/**
 * Execute handler or output validation result based on mode
 */
async function executeOrValidate(
	ctx: CommandContext,
	commandName: string,
	handler?: (ctx: CommandContext) => unknown | Promise<unknown>,
	hasResponseSchema?: boolean,
	webUrl?: WebUrlSpec
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

		// Render "View on the web" link after successful execution (not shown on errors)
		maybeRenderWebLink(ctx, webUrl);

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
/**
 * Format a user-friendly message for a validation issue
 */
function formatValidationIssueMessage(
	field: string,
	message: string,
	isArg: boolean = false
): string {
	// Detect "expected X, received undefined" pattern (missing required value)
	if (message.includes('received undefined')) {
		if (field && field !== 'unknown') {
			if (isArg) {
				return `Missing required argument: <${field}>`;
			}
			return `Missing required option: --${field}`;
		}
		return 'Missing required value';
	}

	// Detect "expected X, received Y" pattern (wrong type)
	const typeMatch = message.match(/expected (\w+), received (\w+)/i);
	if (typeMatch) {
		const [, expected, received] = typeMatch;
		if (field && field !== 'unknown') {
			if (isArg) {
				return `Invalid value for <${field}>: expected ${expected}, got ${received}`;
			}
			return `Invalid value for --${field}: expected ${expected}, got ${received}`;
		}
		return `Invalid value: expected ${expected}, got ${received}`;
	}

	// Default: include the field name if we have it
	if (field && field !== 'unknown') {
		if (isArg) {
			return `<${field}>: ${message}`;
		}
		return `--${field}: ${message}`;
	}
	return message;
}

/**
 * Custom error class to wrap ZodErrors with context about whether they are for args or options
 */
class SchemaValidationError extends Error {
	constructor(
		public readonly originalError: unknown,
		public readonly isArg: boolean
	) {
		super('Schema validation error');
	}
}

/**
 * Parse args schema and wrap any ZodError with context
 */
function parseArgs<T>(schema: { parse: (input: unknown) => T }, input: unknown): T {
	try {
		return schema.parse(input);
	} catch (error) {
		if (error && typeof error === 'object' && 'issues' in error) {
			throw new SchemaValidationError(error, true);
		}
		throw error;
	}
}

/**
 * Parse options schema (no wrapping needed, isArg defaults to false)
 */
function parseOptions<T>(schema: { parse: (input: unknown) => T }, input: unknown): T {
	return schema.parse(input);
}

function handleValidationError(
	error: unknown,
	commandName: string,
	baseCtx: { options: GlobalOptions; logger: Logger }
): never {
	// Unwrap SchemaValidationError to get context about whether it's an arg or option
	let actualError = error;
	let isArg = false;
	if (error instanceof SchemaValidationError) {
		actualError = error.originalError;
		isArg = error.isArg;
	}

	if (actualError && typeof actualError === 'object' && 'issues' in actualError) {
		const issues = (actualError as { issues: Array<{ path: string[]; message: string }> }).issues;

		const formattedIssues = issues.map((issue) => {
			const field = issue.path?.length ? issue.path.join('.') : 'unknown';
			return {
				field,
				message: issue.message,
				formatted: formatValidationIssueMessage(field, issue.message, isArg),
			};
		});

		if (isValidateMode(baseCtx.options)) {
			// In validate mode, output structured validation result
			const result: ValidationResult = {
				valid: false,
				command: commandName,
				errors: formattedIssues.map(({ field, message }) => ({ field, message })),
			};
			outputValidation(result, baseCtx.options);
			process.exit(ExitCode.VALIDATION_ERROR);
		} else {
			// Build a clear, actionable error message
			const errorMessages = formattedIssues.map((i) => i.formatted);
			const primaryMessage =
				errorMessages.length === 1 && errorMessages[0]
					? errorMessages[0]
					: 'Invalid options or arguments';

			const suggestions = [`Run 'agentuity ${commandName} --help' for usage information`];
			// Add agent-friendly hints when running from an AI agent
			if (getExecutingAgent()) {
				suggestions.push(
					`Run 'agentuity ${commandName} --describe' to see the command schema as JSON`,
					`Use --input '{...}' to pass arguments and options as a JSON object`
				);
			}
			exitWithError(
				{
					code: ErrorCode.VALIDATION_FAILED,
					message: primaryMessage,
					details: errorMessages.length > 1 ? { errors: errorMessages } : undefined,
					suggestions,
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

/**
 * Get the full command path for a command (e.g., "cloud sandbox snapshot delete")
 * Uses Commander's _getCommandAndAncestors to traverse the command hierarchy.
 */
function getFullCommandPath(cmd: Command): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const ancestors = (cmd as any)._getCommandAndAncestors() as Command[];
	// ancestors is [current, parent, grandparent, ...root] - reverse and skip root program name
	const names = ancestors.map((c) => c.name()).reverse();
	// Skip the first entry if it's the root program (usually empty or 'agentuity')
	if (names.length > 1 && (names[0] === '' || names[0] === 'agentuity')) {
		return names.slice(1).join(' ');
	}
	return names.join(' ');
}

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
		error.name === 'ProjectConfigNotFoundException'
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
async function promptProjectSelection(baseCtx: CommandContext): Promise<ProjectConfig | null> {
	const { config } = baseCtx;

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
	const maxNameLength = Math.min(40, Math.max(...sortedProjects.map((p) => p.name.length)));

	const selectedProjectId = await prompt.select<string>({
		message: 'Select a project',
		options: sortedProjects.map((p) => {
			// Truncate and pad name for alignment
			const displayName =
				p.name.length > maxNameLength
					? `${p.name.substring(0, maxNameLength - 1)}…`
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

	if (selectedProject.id !== config?.preferences?.projectId) {
		await saveProjectId(selectedProject.id);
	}

	// Convert to ProjectConfig format
	return {
		projectId: selectedProject.id,
		orgId: selectedProject.orgId,
		region: selectedProject.cloudRegion || '',
	};
}

export async function createCLI(version: string): Promise<Command> {
	const program = new Command();
	setProgram(program);

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
		.option(
			'--project-id <id>',
			'Use a specific project when performing operations (AGENTUITY_CLOUD_PROJECT_ID)',
			process.env.AGENTUITY_CLOUD_PROJECT_ID
		)
		.option('--color-scheme <scheme>', 'Color scheme: light or dark')
		.option('--color <mode>', 'Color output: auto, always, never', 'auto')
		.option('--error-format <format>', 'Error output format: json or text', 'text')
		.option('--json', 'Output in JSON format (machine-readable)', false)
		.option('--quiet', 'Suppress non-essential output', false)
		.option('--no-progress', 'Disable progress indicators', false)
		.option('--explain', 'Show what the command would do without executing', false)
		.option('--dry-run', 'Execute command without making changes', false)
		.option('--validate', 'Validate arguments and options without executing', false)
		.option('--ai-help', 'Show AI-optimized help in dashdash format', false)
		.option('--input <json>', 'Pass arguments and options as a JSON object (for agents)')
		.option('--describe', 'Output command schema as JSON for agent introspection', false)
		.option(
			'--fields <fields>',
			'Filter JSON output to specified fields (comma-separated, dot notation for nested)'
		);

	// Note: We intentionally do NOT add a global --org alias for --org-id because
	// some subcommands (like env commands) define their own --org option with
	// different semantics (boolean for "use org scope" vs string for specific org ID).
	// Adding a global --org would shadow the subcommand's --org option.

	const skipVersionCheckOption = program.createOption(
		'--skip-version-check',
		'Skip version compatibility check (dev only)'
	);
	skipVersionCheckOption.hideHelp();
	program.addOption(skipVersionCheckOption);

	const profileOption = program.createOption(
		'--profile <name>',
		'Override the default profile (takes precedence over AGENTUITY_PROFILE env var)'
	);
	profileOption.hideHelp();
	program.addOption(profileOption);

	program.action(() => {
		program.help();
	});

	// Handle unknown commands
	program.on('command:*', (operands: string[]) => {
		const unknownCommand = operands[0];
		const opts = getOutputOptions();
		if (opts?.json || opts?.errorFormat === 'json') {
			console.error(
				formatErrorJSON(
					createError(ErrorCode.UNKNOWN_COMMAND, `unknown command '${unknownCommand}'`)
				)
			);
			process.exit(1);
			return;
		}
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

	// Track whether a JSON error was already emitted by outputError
	// so we can suppress Commander's help-after-error text in JSON mode
	let jsonErrorEmitted = false;

	// Custom error handling for argument/command parsing errors
	program.configureOutput({
		writeErr: (str) => {
			// In JSON mode, suppress Commander's help-after-error text
			// (we already emitted a structured JSON error in outputError)
			const opts = getOutputOptions();
			if (jsonErrorEmitted && (opts?.json || opts?.errorFormat === 'json')) {
				return;
			}
			process.stderr.write(str);
		},
		outputError: (str, write) => {
			// Suppress "unknown option '--help'" error since we handle help flags specially
			if (str.includes("unknown option '--help'")) {
				return;
			}
			// In JSON mode, output structured JSON errors for all Commander parsing errors
			const opts = getOutputOptions();
			if (opts?.json || opts?.errorFormat === 'json') {
				// Strip "error: " prefix and trailing newline for clean message
				let message = str.replace(/^error:\s*/, '').replace(/\n$/, '');
				let code = ErrorCode.INVALID_OPTION;
				if (str.includes('unknown command') || str.includes('too many arguments')) {
					code = ErrorCode.UNKNOWN_COMMAND;
				} else if (str.includes('missing required argument')) {
					code = ErrorCode.MISSING_ARGUMENT;
				}
				// Extract Commander's "Did you mean" suggestion into a separate field
				let suggestions: string[] | undefined;
				const suggestionMatch = message.match(/\n\(Did you mean (.+)\?\)/);
				if (suggestionMatch?.[1] != null) {
					suggestions = [suggestionMatch[1] as string];
					message = message.replace(/\n\(Did you mean .+\?\)/, '');
				}
				// Write directly to stderr (not via write/writeErr) to avoid
				// self-suppression — writeErr suppresses output when jsonErrorEmitted is true
				jsonErrorEmitted = true;
				process.stderr.write(
					`${formatErrorJSON(createError(code, message, undefined, suggestions))}\n`
				);
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

			// Show intro for first-time agents (before normal help output)
			// AGENTUITY_SHOW_INTRO=1 forces showing the intro (useful for testing)
			const agent = getExecutingAgent();
			const forceShowIntro = process.env.AGENTUITY_SHOW_INTRO === '1';
			const hasSeenIntro = agent ? hasAgentSeenIntro(agent) : true;

			if (agent && (forceShowIntro || !hasSeenIntro)) {
				// Only mark as seen if this is their first time (not on forced re-shows)
				if (!hasSeenIntro) {
					markAgentIntroSeen(agent);
				}

				const separator = '='.repeat(79);
				output += `${separator}\n\n`;
				output += generateIntroPrompt(agent);
				output += `\n${separator}\n\n`;
			}

			// Show banner (full for root, compact for subcommands)
			// Skip banner when running from an AI coding agent
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const isRootCommand = !(cmd as any).parent;
			if (!agent) {
				if (isRootCommand) {
					output += `${generateBanner(version)}\n\n`;
				} else {
					output += `${generateBanner(version, true)}\n`;
				}
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

async function getRegion(regions: RegionList, preferredRegion?: string): Promise<string> {
	const firstRegion = regions[0];
	if (regions.length === 1 && firstRegion) {
		return firstRegion.region;
	} else {
		const preferredIndex = preferredRegion
			? regions.findIndex((region) => region.region === preferredRegion)
			: -1;
		const response = await enquirer.prompt<{ region: string }>({
			type: 'select',
			name: 'region',
			message: 'Select a cloud region:',
			...(preferredIndex >= 0 && { initial: preferredIndex }),
			choices: regions.map((r) => ({
				name: r.region,
				message: `${r.description.padEnd(15, ' ')} ${tui.muted(r.region)}`,
			})),
		});
		return response.region;
	}
}

const RESOURCE_PREFIXES: Array<{ prefix: string; type: ResourceType }> = [
	{ prefix: 'sbx_', type: 'sandbox' },
	{ prefix: 'proj_', type: 'project' },
	{ prefix: 'db_', type: 'db' },
	{ prefix: 'deploy_', type: 'deployment' },
	{ prefix: 'machine_', type: 'machine' },
	{ prefix: 'que_', type: 'queue' },
	{ prefix: 'vec_', type: 'vector' },
	{ prefix: 'kv_', type: 'kv' },
	{ prefix: 'stream_', type: 'stream' },
];

type PrefixedResource = { id: string; type: ResourceType };

function getResourceTypeFromId(id: string): ResourceType | undefined {
	for (const entry of RESOURCE_PREFIXES) {
		if (id.startsWith(entry.prefix)) {
			return entry.type;
		}
	}
	return undefined;
}

function collectPrefixedResources(
	values?: Record<string, unknown> | unknown[]
): PrefixedResource[] {
	if (!values) {
		return [];
	}
	const results = new Map<string, ResourceType>();
	const addValue = (value: unknown) => {
		if (typeof value === 'string') {
			const resourceType = getResourceTypeFromId(value);
			if (resourceType) {
				results.set(value, resourceType);
			}
			return;
		}
		if (Array.isArray(value)) {
			for (const entry of value) {
				addValue(entry);
			}
		}
	};

	if (Array.isArray(values)) {
		for (const entry of values) {
			addValue(entry);
		}
	} else {
		for (const value of Object.values(values)) {
			addValue(value);
		}
	}

	return Array.from(results.entries()).map(([id, type]) => ({ id, type }));
}

export interface ResolveRegionOptions {
	options: Record<string, unknown>;
	regions: RegionList;
	logger: Logger;
	required: boolean;
	region?: string;
	config?: Config | null;
	args?: Record<string, unknown> | unknown[];
}

export async function resolveRegion(opts: ResolveRegionOptions): Promise<string | undefined> {
	const { options, regions, logger, required, config, args } = opts;

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
	let region = options.region as string | undefined;

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

	const profileName = config?.name ?? defaultProfileName;
	const candidateResources = new Map<string, ResourceType>();
	for (const resource of collectPrefixedResources(args)) {
		candidateResources.set(resource.id, resource.type);
	}
	for (const resource of collectPrefixedResources(options)) {
		candidateResources.set(resource.id, resource.type);
	}
	for (const [id, type] of candidateResources.entries()) {
		const cachedInfo = await getResourceInfo(type, profileName, id);
		if (cachedInfo?.region) {
			logger.trace('resolved region from cache for %s (%s): %s', id, type, cachedInfo.region);
			return cachedInfo.region;
		}
	}

	// Auto-select if only one region available
	const singleRegion = regions[0];
	if (regions.length === 1 && singleRegion) {
		region = singleRegion.region;
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

	// Check for preferred region in config
	const preferredRegion = config?.preferences?.region;
	if (preferredRegion) {
		const matchingRegion = regions.find((r) => r.region === preferredRegion);
		if (matchingRegion) {
			if (process.stdin.isTTY) {
				region = await getRegion(regions, matchingRegion.region);
				return region;
			}
			logger.trace('selected preferred region (non-TTY): %s', matchingRegion.region);
			return matchingRegion.region;
		}
	}

	// Check for project region fallback
	const projectRegion = opts.region;
	if (projectRegion) {
		const matchingRegion = regions.find((r) => r.region === projectRegion);
		if (matchingRegion) {
			return matchingRegion.region;
		}
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
					'Or set AGENTUITY_REGION environment variable',
				]
			),
			logger,
			errorFormat ?? 'text'
		);
	}

	if (process.stdin.isTTY) {
		// Interactive mode - prompt user
		region = await getRegion(regions);

		const hasSavedPreference = !!config?.preferences?.region;
		const hasEnvRegion = !!process.env.AGENTUITY_REGION;
		const hasTTY = process.stdin.isTTY && process.stdout.isTTY;
		if (region && hasTTY && !hasSavedPreference && !hasEnvRegion) {
			const selectedRegionInfo = regions.find((r) => r.region === region);
			const regionLabel = selectedRegionInfo
				? `${selectedRegionInfo.description} (${selectedRegionInfo.region})`
				: region;
			const shouldSave = await tui.confirm(
				`Would you like to set "${regionLabel}" as your default region?`,
				true
			);
			if (shouldSave) {
				await saveRegion(region);
			}
		}

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

	// Allow pass-through args for commands that need to forward unknown options
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((subcommand as any).passThroughArgs) {
		cmd.allowUnknownOption();
		cmd.allowExcessArguments();
		// Disable help option so --help passes through to the target command
		cmd.helpOption(false);
	} else {
		cmd.helpOption('-h, --help [json]', 'Display help (with optional JSON output)');
	}

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
			return `\n${tui.colorPrimary('\x1b[4mExamples:\x1b[24m')}\n${formatted.join('\n')}`;
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

		// Handle --describe for command-group nodes
		cmd.action(async () => {
			if (baseCtx.options.describe) {
				const { extractSubcommandSchema } = await import('./schema-generator');
				const schema = extractSubcommandSchema(subcommand);
				const { outputJSON } = await import('./output');
				outputJSON(schema);
				return;
			}
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

	// Note: --org-id may also be added below if the schema defines orgId;
	// in that case we skip adding it here to avoid conflicts.
	const _deferOrgIdFlag = requiresOrg || optionalOrg;

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

	// Track if projectId/orgId is defined in schema options
	let hasProjectIdInSchema = false;
	let hasOrgIdInSchema = false;

	if (subcommand.schema?.options) {
		const parsed = parseOptionsSchema(subcommand.schema.options);
		const aliases = subcommand.schema.aliases ?? {};
		for (const opt of parsed) {
			const flag = opt.name
				.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
				.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
				.toLowerCase();

			// Track if this schema defines projectId (as 'projectId' or 'project-id')
			if (opt.name === 'projectId' || opt.name === 'project-id' || flag === 'project-id') {
				hasProjectIdInSchema = true;
			}

			// Track if this schema defines orgId (as 'orgId' or 'org-id')
			if (opt.name === 'orgId' || opt.name === 'org-id' || flag === 'org-id') {
				hasOrgIdInSchema = true;
			}

			const desc = opt.description || '';
			// Build flag spec with aliases (check both camelCase and kebab-case names)
			// Auto-add -y alias for confirm flag
			let optAliases = aliases[opt.name] ?? aliases[flag] ?? [];
			if (flag === 'confirm' && !optAliases.includes('y')) {
				optAliases = ['y', ...optAliases];
			}
			let flagSpec = `--${flag}`;
			if (flag === 'verbose') {
				flagSpec = `-v, --${flag}`;
			} else if (flag === 'confirm') {
				// Add -y short alias for --confirm
				flagSpec = `-y, --${flag}`;
			} else if (optAliases.length > 0) {
				const aliasFlags = optAliases
					.map((a) => (a.length === 1 ? `-${a}` : `--${a}`))
					.join(', ');
				flagSpec = `${aliasFlags}, --${flag}`;
			}
			if (opt.type === 'boolean') {
				if (opt.hasDefault) {
					const defaultValue =
						typeof opt.defaultValue === 'function' ? opt.defaultValue() : opt.defaultValue;
					// Register both positive and negative forms so both work,
					// but only show one in help based on the default value
					const baseDesc = desc.replace(/\s*\(use\s+--no-\S+\s+to\s+skip\)/i, '').trim();
					const negatedDesc = baseDesc.toLowerCase().startsWith('run ')
						? `Skip ${baseDesc.slice(4)}`
						: `Do not ${baseDesc.charAt(0).toLowerCase()}${baseDesc.slice(1)}`;

					if (defaultValue === true) {
						// Show --no-* in help, hide positive flag
						cmd.option(`--no-${flag}`, negatedDesc);
						const positiveOption = cmd.createOption(flagSpec, baseDesc);
						positiveOption.default(defaultValue);
						positiveOption.hideHelp();
						cmd.addOption(positiveOption);
					} else {
						// Show positive flag in help, but also register --no-* hidden
						cmd.option(flagSpec, desc);
						const negativeOption = cmd.createOption(`--no-${flag}`, negatedDesc);
						negativeOption.hideHelp();
						cmd.addOption(negativeOption);
					}
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
			} else if (opt.type === 'optionalString') {
				// Optional string: --flag uses true, --flag=value uses the string value
				// In Commander.js, [value] means optional argument
				cmd.option(`${flagSpec} [${opt.name}]`, desc);
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

	// Add hidden --yes and --force aliases for --confirm if command has a confirm option
	if (subcommand.schema?.options) {
		const parsed = parseOptionsSchema(subcommand.schema.options);
		const hasConfirmOption = parsed.some((opt) => opt.name === 'confirm');
		if (hasConfirmOption) {
			// Add hidden --yes option that sets confirm to true
			const yesOption = cmd.createOption('--yes', 'Alias for --confirm');
			yesOption.hideHelp();
			cmd.addOption(yesOption);
			// Add hidden --force option that sets confirm to true,
			// but only if the schema doesn't already declare its own --force option
			const hasForceOption = parsed.some((opt) => opt.name === 'force');
			if (!hasForceOption) {
				const forceOption = cmd.createOption('--force', 'Alias for --confirm');
				forceOption.hideHelp();
				cmd.addOption(forceOption);
			}
		}
	}

	// Add --org-id if command requires/optional org and doesn't define it in schema
	if (_deferOrgIdFlag && !hasOrgIdInSchema) {
		cmd.option('--org-id <id>', 'organization ID');
		// Add hidden --org alias, but only if schema doesn't define its own --org option
		// (e.g., env commands use --org for "org scope" which is different from --org-id)
		const schemaDefinesOrg = subcommand.schema?.options
			? parseOptionsSchema(subcommand.schema.options).some((o) => o.name === 'org')
			: false;
		if (!schemaDefinesOrg) {
			// Use [id] (optional) to allow --org without argument for default org
			const orgAlias = cmd.createOption('--org [id]', 'Alias for --org-id');
			orgAlias.hideHelp();
			cmd.addOption(orgAlias);
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

		// Normalize --org to --org-id for downstream code
		// The --org [id] option is parsed into options.org, but code uses options.orgId
		// Handle: --org (true -> undefined for default org), --org org_123 (string -> string)
		if (options.org !== undefined && options.orgId === undefined) {
			if (options.org === true) {
				// --org without argument: mark as explicitly requested (use default org)
				// Set to undefined so org resolution falls through to preference/env/prompt
				options.orgId = undefined;
			} else if (typeof options.org === 'string') {
				options.orgId = options.org;
			}
		}

		// Handle --describe mode: output command schema and exit
		if (baseCtx.options.describe) {
			const { extractSubcommandSchema } = await import('./schema-generator');
			const schema = extractSubcommandSchema(subcommand);
			const { outputJSON } = await import('./output');
			outputJSON(schema);
			return;
		}

		// One-time hint for agents about structured input/output features
		// Emitted on stderr so it doesn't interfere with --json stdout
		const detectedAgent = getExecutingAgent();
		if (detectedAgent) {
			const { hasAgentSeenInputHint, markAgentInputHintSeen } = await import('./cache');
			if (!hasAgentSeenInputHint(detectedAgent)) {
				markAgentInputHintSeen(detectedAgent);
				console.error(
					'[agent] This CLI supports structured I/O for agents: --input <json> (structured input), --describe (schema introspection), --fields (output filtering). Run --ai-help for details.'
				);
			}
		}

		// Merge global --org-id and --project-id into subcommand options when the schema
		// defines these fields. Global options (program-level) capture the values first,
		// so subcommand-level options may not have them. Only merge when the user
		// explicitly passed the flag on the CLI (not from env var defaults).
		const argv = process.argv;
		const hasExplicitOrgId = argv.some(
			(a) =>
				a === '--org-id' || a.startsWith('--org-id=') || a === '--org' || a.startsWith('--org=')
		);
		const hasExplicitProjectId = argv.some(
			(a) => a === '--project-id' || a.startsWith('--project-id=')
		);
		if (
			hasOrgIdInSchema &&
			options.orgId === undefined &&
			hasExplicitOrgId &&
			baseCtx.options.orgId
		) {
			options.orgId = baseCtx.options.orgId;
		}
		if (
			hasProjectIdInSchema &&
			options.projectId === undefined &&
			hasExplicitProjectId &&
			(baseCtx.options as unknown as Record<string, unknown>).projectId
		) {
			options.projectId = (baseCtx.options as unknown as Record<string, unknown>).projectId;
		}

		if (subcommand.banner) {
			showBanner();
		}

		const normalized = normalizeReqs(subcommand);

		let project: ProjectConfig | undefined;
		let projectDir: string | undefined;
		const dirNeeded = normalized.requiresProject || normalized.optionalProject;

		if (dirNeeded) {
			const optionsProjectId = options.projectId as string | undefined;

			// Helper to fetch project from API by ID
			const fetchProjectFromAPI = async (
				projectId: string
			): Promise<ProjectConfig | undefined> => {
				const auth = await requireAuth(baseCtx);
				if (auth) {
					// Create config with auth credentials for API client
					const configWithAuth = {
						...baseCtx.config,
						auth: {
							api_key: auth.apiKey,
							user_id: auth.userId,
							expires: auth.expires.getTime(),
						},
					};
					const apiClient = createAPIClient(baseCtx, configWithAuth as Config);
					// Check cache first to avoid duplicate API calls
					const profile = baseCtx.config?.name ?? 'default';
					let projectDetails = getCachedProject(profile, projectId);
					if (!projectDetails) {
						const { projectGet } = await import('@agentuity/server');
						// Use keys: false to match other callers and ensure cache consistency
						projectDetails = await projectGet(apiClient, { id: projectId, keys: false });
						setCachedProject(profile, projectId, projectDetails);
					}
					return {
						projectId: projectDetails.id,
						orgId: projectDetails.orgId,
						region: projectDetails.cloudRegion || '',
					};
				}
				return undefined;
			};

			// Resolution precedence:
			// 1. --project-id flag (or AGENTUITY_CLOUD_PROJECT_ID env var)
			// 2. agentuity.json in project directory
			// 3. config.preferences.projectId (global preference) - fallback only
			// 4. Interactive selection (if TTY)

			if (optionsProjectId) {
				// Priority 1: Explicit flag/env var provided
				try {
					project = await fetchProjectFromAPI(optionsProjectId);
				} catch (_error) {
					if (normalized.requiresProject) {
						exitWithError(
							createError(
								ErrorCode.PROJECT_NOT_FOUND,
								`Project not found: ${optionsProjectId}`,
								undefined,
								[
									'Verify the project ID is correct',
									`Run "${getCommand('project list')}" to see available projects`,
								]
							),
							baseCtx.logger,
							baseCtx.options.errorFormat
						);
					}
				}
			} else {
				// Priority 2: Try to load from agentuity.json in directory
				const dir = (options.dir as string | undefined) ?? process.cwd();
				projectDir = dir;
				if (projectDir.startsWith('~/')) {
					projectDir = projectDir.replace('~/', homedir());
				}
				projectDir = resolve(projectDir);
				try {
					project = await loadProjectConfig(dir, baseCtx.config);
				} catch (error) {
					const isConfigNotFound =
						error &&
						typeof error === 'object' &&
						'name' in error &&
						error.name === 'ProjectConfigNotFoundException';

					if (isConfigNotFound) {
						// Priority 3: Try global preference (only when no agentuity.json found)
						const projectIdFromPreference = baseCtx.config?.preferences?.projectId as
							| string
							| undefined;
						if (projectIdFromPreference) {
							try {
								project = await fetchProjectFromAPI(projectIdFromPreference);
								if (project) {
									// Set the project ID in options so it can be used by the command
									(options as Record<string, unknown>).projectId = projectIdFromPreference;
								}
							} catch (_preferenceError) {
								// Preference project not found, fall through to interactive selection
								baseCtx.logger.trace(
									'Preference project not found: %s',
									projectIdFromPreference
								);
							}
						}

						// Priority 4: Interactive selection (if TTY and still no project)
						if (!project && normalized.requiresProject) {
							const hasTTY = process.stdin.isTTY && process.stdout.isTTY;

							if (hasTTY) {
								// Try to prompt for project selection
								try {
									const selectedProject = await promptProjectSelection(baseCtx);
									if (selectedProject) {
										// Set the project ID in options so it can be used by the command
										(options as Record<string, unknown>).projectId =
											selectedProject.projectId;
										project = selectedProject;
									}
								} catch (promptError) {
									// If prompting fails, fall through to the original error
									baseCtx.logger.trace('Project selection prompt failed: %s', promptError);
								}
							}

							if (!project) {
								exitWithError(
									createError(
										ErrorCode.PROJECT_NOT_FOUND,
										'Invalid project folder',
										undefined,
										[
											'Use --dir to specify a different directory',
											'Use --project-id to specify a project by ID',
											'Change to a directory containing agentuity.json',
											`Run "${getCommand('project create')}" to create a new project`,
										]
									),
									baseCtx.logger,
									baseCtx.options.errorFormat
								);
							}
						}
					} else if (normalized.requiresProject) {
						throw error;
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
					// Check if command uses stdin (don't auto-confirm if it does)
					const usesStdin = subcommand.tags?.includes('uses-stdin') ?? false;
					const input = await buildValidationInputAsync(
						subcommand.schema,
						args,
						options,
						{ usesStdin },
						baseCtx.options.input
					);
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
						ctx.args = parseArgs(subcommand.schema.args, input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = parseOptions(subcommand.schema.options, input.options);
					}
					if (normalized.requiresAPIClient) {
						// Recreate apiClient with auth credentials
						ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
					}
					// Auto-select org when --confirm flag is used
					const autoSelectOrg = options.confirm === true;
					const hasPrefixedId = hasPrefixedResourceId(
						ctx.args as Record<string, unknown> | undefined,
						ctx.opts as Record<string, unknown> | undefined
					);
					const prefixedOrgId = hasPrefixedId
						? await resolveOrgIdWithoutPrompt({
								options,
								config: (ctx.config as Config | null) ?? null,
								args: ctx.args as Record<string, unknown> | undefined,
								opts: ctx.opts as Record<string, unknown> | undefined,
							})
						: undefined;
					if (normalized.requiresOrg) {
						ctx.orgId = hasPrefixedId
							? prefixedOrgId
							: await requireOrg(
									ctx as CommandContext & { apiClient: APIClientType },
									autoSelectOrg
								);
					}
					// Skip org handling if --no-register is set (org only needed for registration)
					const skipOrg =
						normalized.optionalOrg &&
						!normalized.requiresOrg &&
						ctx.opts &&
						(ctx.opts as Record<string, unknown>).register === false;

					if (normalized.optionalOrg && ctx.auth && !skipOrg) {
						ctx.orgId = hasPrefixedId
							? prefixedOrgId
							: await selectOptionalOrg(
									ctx as CommandContext & { apiClient: APIClientType },
									autoSelectOrg
								);
					}
					// Skip region handling if --no-register is set (region only needed for registration)
					const skipRegion =
						normalized.optionalRegion &&
						!normalized.requiresRegion &&
						!normalized.requiresRegions &&
						ctx.opts &&
						(ctx.opts as Record<string, unknown>).register === false;

					if (
						(normalized.requiresRegion ||
							normalized.optionalRegion ||
							normalized.requiresRegions) &&
						ctx.apiClient &&
						!skipRegion
					) {
						const apiClient: APIClientType = ctx.apiClient as APIClientType;
						const regions = await tui.spinner({
							message: 'Fetching cloud regions',
							clearOnSuccess: true,
							callback: async () => {
								return fetchRegionsWithCache(
									baseCtx.config?.name ?? defaultProfileName,
									apiClient,
									baseCtx.logger
								);
							},
						});
						if (normalized.requiresRegions) {
							ctx.regions = regions;
						}
						if (normalized.requiresRegion || normalized.optionalRegion) {
							const region = await resolveRegion({
								options: options as Record<string, unknown>,
								args: ctx.args as Record<string, unknown> | undefined,
								regions,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
								region: project?.region,
								config: baseCtx.config ?? null,
							});
							if (region) {
								ctx.region = region;
							}
						}
					}
					await executeOrValidate(
						ctx as CommandContext,
						getFullCommandPath(cmd),
						subcommand.handler,
						!!subcommand.schema?.response,
						subcommand.webUrl
					);
				} catch (error) {
					if (isCLIValidationError(error)) {
						handleValidationError(error, getFullCommandPath(cmd), baseCtx);
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
				// Auto-select org when --confirm flag is used
				const autoSelectOrg2 = options.confirm === true;
				const hasPrefixedId = hasPrefixedResourceId(args as unknown[]);
				const prefixedOrgId = hasPrefixedId
					? await resolveOrgIdWithoutPrompt({
							options,
							config: (ctx.config as Config | null) ?? null,
							args: args as unknown[],
						})
					: undefined;
				if (normalized.requiresOrg) {
					ctx.orgId = hasPrefixedId
						? prefixedOrgId
						: await requireOrg(
								ctx as CommandContext & { apiClient: APIClientType },
								autoSelectOrg2
							);
				}
				// Skip org handling if --no-register is set (org only needed for registration)
				const skipOrg =
					normalized.optionalOrg &&
					!normalized.requiresOrg &&
					ctx.opts &&
					(ctx.opts as Record<string, unknown>).register === false;

				if (normalized.optionalOrg && ctx.auth && !skipOrg) {
					ctx.orgId = hasPrefixedId
						? prefixedOrgId
						: await selectOptionalOrg(
								ctx as CommandContext & { apiClient: APIClientType },
								autoSelectOrg2
							);
				}
				// Skip region handling if --no-register is set (region only needed for registration)
				const skipRegion =
					normalized.optionalRegion &&
					!normalized.requiresRegion &&
					!normalized.requiresRegions &&
					ctx.opts &&
					(ctx.opts as Record<string, unknown>).register === false;

				if (
					(normalized.requiresRegion ||
						normalized.optionalRegion ||
						normalized.requiresRegions) &&
					ctx.apiClient &&
					!skipRegion
				) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const regions = await tui.spinner({
						message: 'Fetching cloud regions',
						clearOnSuccess: true,
						callback: async () => {
							return fetchRegionsWithCache(
								baseCtx.config?.name ?? defaultProfileName,
								apiClient,
								baseCtx.logger
							);
						},
					});
					if (normalized.requiresRegions) {
						ctx.regions = regions;
					}
					if (normalized.requiresRegion || normalized.optionalRegion) {
						const region = await resolveRegion({
							options: options as Record<string, unknown>,
							args: args as unknown[],
							regions,
							logger: baseCtx.logger,
							required: !!normalized.requiresRegion,
							region: project?.region,
							config: baseCtx.config ?? null,
						});
						if (region) {
							ctx.region = region;
						}
					}
				}
				if (subcommand.handler) {
					const result = await subcommand.handler(ctx as CommandContext);
					// Render "View on the web" link after successful execution (not shown on errors)
					maybeRenderWebLink(ctx as CommandContext, subcommand.webUrl);

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
									`Command '${getFullCommandPath(cmd)}' declares a response schema but returned no data. This is a bug in the command implementation.`
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

			// Check if --confirm flag or --no-register flag is set to skip interactive prompts
			const skipPrompts = options.confirm === true || options.register === false;
			const auth = await optionalAuth(
				baseCtx as CommandContext<undefined>,
				continueText,
				skipPrompts
			);

			if (subcommand.schema) {
				try {
					// Check if command uses stdin (don't auto-confirm if it does)
					const usesStdin = subcommand.tags?.includes('uses-stdin') ?? false;
					const input = await buildValidationInputAsync(
						subcommand.schema,
						args,
						options,
						{
							usesStdin,
						},
						baseCtx.options.input
					);
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
						ctx.args = parseArgs(subcommand.schema.args, input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = parseOptions(subcommand.schema.options, input.options);
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
					// Auto-select org when --confirm flag is used
					const autoSelectOrg3 = options.confirm === true;
					const hasPrefixedId3 = hasPrefixedResourceId(
						ctx.args as Record<string, unknown> | undefined,
						ctx.opts as Record<string, unknown> | undefined
					);
					const prefixedOrgId3 = hasPrefixedId3
						? await resolveOrgIdWithoutPrompt({
								options,
								config: (ctx.config as Config | null) ?? null,
								args: ctx.args as Record<string, unknown> | undefined,
								opts: ctx.opts as Record<string, unknown> | undefined,
							})
						: undefined;
					if (normalized.requiresOrg && ctx.apiClient) {
						ctx.orgId = hasPrefixedId3
							? prefixedOrgId3
							: await requireOrg(
									ctx as CommandContext & { apiClient: APIClientType },
									autoSelectOrg3
								);
					}
					// Skip org handling if --no-register is set (org only needed for registration)
					const skipOrg =
						normalized.optionalOrg &&
						!normalized.requiresOrg &&
						ctx.opts &&
						(ctx.opts as Record<string, unknown>).register === false;

					if (normalized.optionalOrg && ctx.apiClient && auth && !skipOrg) {
						ctx.orgId = hasPrefixedId3
							? prefixedOrgId3
							: await selectOptionalOrg(
									ctx as CommandContext & { apiClient?: APIClientType; auth?: AuthData },
									autoSelectOrg3
								);
						baseCtx.logger.trace('selected orgId: %s', ctx.orgId);
					}
					// Skip region handling if --no-register is set (region only needed for registration)
					const skipRegion =
						normalized.optionalRegion &&
						!normalized.requiresRegion &&
						ctx.opts &&
						(ctx.opts as Record<string, unknown>).register === false;

					if (
						(normalized.requiresRegion || normalized.optionalRegion) &&
						ctx.apiClient &&
						auth &&
						!skipRegion
					) {
						const apiClient: APIClientType = ctx.apiClient as APIClientType;
						const regions = await tui.spinner({
							message: 'Fetching cloud regions',
							clearOnSuccess: true,
							callback: async () => {
								return fetchRegionsWithCache(
									baseCtx.config?.name ?? defaultProfileName,
									apiClient,
									baseCtx.logger
								);
							},
						});
						const region = await resolveRegion({
							options: options as Record<string, unknown>,
							args: ctx.args as Record<string, unknown> | undefined,
							regions,
							logger: baseCtx.logger,
							required: !!normalized.requiresRegion,
							region: project?.region,
							config: baseCtx.config ?? null,
						});
						if (region) {
							ctx.region = region;
						}
					}
					await executeOrValidate(
						ctx as CommandContext,
						getFullCommandPath(cmd),
						subcommand.handler,
						!!subcommand.schema?.response,
						subcommand.webUrl
					);
				} catch (error) {
					if (isCLIValidationError(error)) {
						handleValidationError(error, getFullCommandPath(cmd), baseCtx);
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
				// Auto-select org when --confirm flag is used
				const autoSelectOrg4 = options.confirm === true;
				const hasPrefixedId4 = hasPrefixedResourceId(args as unknown[]);
				const prefixedOrgId4 = hasPrefixedId4
					? await resolveOrgIdWithoutPrompt({
							options,
							config: (ctx.config as Config | null) ?? null,
							args: args as unknown[],
						})
					: undefined;
				if (normalized.requiresOrg && ctx.apiClient) {
					ctx.orgId = hasPrefixedId4
						? prefixedOrgId4
						: await requireOrg(
								ctx as CommandContext & { apiClient: APIClientType },
								autoSelectOrg4
							);
				}
				// Skip org handling if --no-register is set (org only needed for registration)
				// For non-schema commands, check options directly (Commander passes all options)
				const skipOrg =
					normalized.optionalOrg &&
					!normalized.requiresOrg &&
					(options as Record<string, unknown>).register === false;

				if (normalized.optionalOrg && ctx.apiClient && !skipOrg) {
					ctx.orgId = hasPrefixedId4
						? prefixedOrgId4
						: await selectOptionalOrg(
								ctx as CommandContext & { apiClient?: APIClientType; auth?: AuthData },
								autoSelectOrg4
							);
				}
				// Skip region handling if --no-register is set (region only needed for registration)
				const skipRegion =
					normalized.optionalRegion &&
					!normalized.requiresRegion &&
					(options as Record<string, unknown>).register === false;

				if (
					(normalized.requiresRegion || normalized.optionalRegion) &&
					ctx.apiClient &&
					!skipRegion
				) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const regions = await tui.spinner({
						message: 'Fetching cloud regions',
						clearOnSuccess: true,
						callback: async () => {
							return fetchRegionsWithCache(
								baseCtx.config?.name ?? defaultProfileName,
								apiClient,
								baseCtx.logger
							);
						},
					});
					const region = await resolveRegion({
						options: options as Record<string, unknown>,
						args: args as unknown[],
						regions,
						logger: baseCtx.logger,
						required: !!normalized.requiresRegion,
						region: project?.region,
						config: baseCtx.config ?? null,
					});
					if (region) {
						ctx.region = region;
					}
				}
				if (subcommand.handler) {
					const result = await subcommand.handler(ctx as CommandContext);
					// Render "View on the web" link after successful execution (not shown on errors)
					maybeRenderWebLink(ctx as CommandContext, subcommand.webUrl);

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
									`Command '${getFullCommandPath(cmd)}' declares a response schema but returned no data. This is a bug in the command implementation.`
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
					// Check if command uses stdin (don't auto-confirm if it does)
					const usesStdin = subcommand.tags?.includes('uses-stdin') ?? false;
					const input = await buildValidationInputAsync(
						subcommand.schema,
						args,
						options,
						{
							usesStdin,
						},
						baseCtx.options.input
					);
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
						ctx.args = parseArgs(subcommand.schema.args, input.args);
					}
					if (subcommand.schema.options) {
						ctx.opts = parseOptions(subcommand.schema.options, input.options);
					}
					if (normalized.requiresAPIClient && !ctx.apiClient) {
						ctx.apiClient = createAPIClient(baseCtx, ctx.config as Config | null);
					}
					// Auto-select org when --confirm flag is used
					const autoSelectOrg5 = options.confirm === true;
					if (normalized.requiresOrg && ctx.apiClient) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType },
							autoSelectOrg5
						);
					}
					if (normalized.optionalOrg && ctx.apiClient && ctx.auth) {
						ctx.orgId = await requireOrg(
							ctx as CommandContext & { apiClient: APIClientType },
							autoSelectOrg5
						);
					}
					await executeOrValidate(
						ctx as CommandContext,
						getFullCommandPath(cmd),
						subcommand.handler,
						!!subcommand.schema?.response,
						subcommand.webUrl
					);
				} catch (error) {
					if (isCLIValidationError(error)) {
						handleValidationError(error, getFullCommandPath(cmd), baseCtx);
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
				// Auto-select org when --confirm flag is used
				const autoSelectOrg6 = options.confirm === true;
				if (normalized.requiresOrg && ctx.apiClient) {
					ctx.orgId = await requireOrg(
						ctx as CommandContext & { apiClient: APIClientType },
						autoSelectOrg6
					);
				}
				if (normalized.optionalOrg && ctx.apiClient && ctx.auth) {
					ctx.orgId = await requireOrg(
						ctx as CommandContext & { apiClient: APIClientType },
						autoSelectOrg6
					);
				}
				if ((normalized.requiresRegion || normalized.optionalRegion) && ctx.apiClient) {
					const apiClient: APIClientType = ctx.apiClient as APIClientType;
					const regions = await tui.spinner({
						message: 'Fetching cloud regions',
						clearOnSuccess: true,
						callback: async () => {
							return fetchRegionsWithCache(
								baseCtx.config?.name ?? defaultProfileName,
								apiClient,
								baseCtx.logger
							);
						},
					});
					const region = await resolveRegion({
						options: options as Record<string, unknown>,
						args: args as unknown[],
						regions,
						logger: baseCtx.logger,
						required: !!normalized.requiresRegion,
						region: project?.region,
						config: baseCtx.config ?? null,
					});
					if (region) {
						ctx.region = region;
					}
				}
				if (subcommand.handler) {
					const result = await subcommand.handler(ctx as CommandContext);
					// Render "View on the web" link after successful execution (not shown on errors)
					maybeRenderWebLink(ctx as CommandContext, subcommand.webUrl);

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
									`Command '${getFullCommandPath(cmd)}' declares a response schema but returned no data. This is a bug in the command implementation.`
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
					return `\n${tui.colorPrimary('\x1b[4mExamples:\x1b[24m')}\n${formatted.join('\n')}`;
				});
			}

			if (cmdDef.handler) {
				cmd.action(async () => {
					// Handle --describe mode: output command schema and exit
					if (baseCtx.options.describe) {
						const { extractCommandSchema } = await import('./schema-generator');
						const schema = extractCommandSchema(cmdDef);
						const { outputJSON } = await import('./output');
						outputJSON(schema);
						return;
					}

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
							const regions = await tui.spinner({
								message: 'Fetching cloud regions',
								clearOnSuccess: true,
								callback: async () => {
									return fetchRegionsWithCache(
										baseCtx.config?.name ?? defaultProfileName,
										apiClient,
										baseCtx.logger
									);
								},
							});
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								regions,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
								config: baseCtx.config ?? null,
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
							const regions = await tui.spinner({
								message: 'Fetching cloud regions',
								clearOnSuccess: true,
								callback: async () => {
									return fetchRegionsWithCache(
										baseCtx.config?.name ?? defaultProfileName,
										apiClient,
										baseCtx.logger
									);
								},
							});
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								regions,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
								config: baseCtx.config ?? null,
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
							const regions = await tui.spinner({
								message: 'Fetching cloud regions',
								clearOnSuccess: true,
								callback: async () => {
									return fetchRegionsWithCache(
										baseCtx.config?.name ?? defaultProfileName,
										apiClient,
										baseCtx.logger
									);
								},
							});
							const region = await resolveRegion({
								options: baseCtx.options as unknown as Record<string, unknown>,
								regions,
								logger: baseCtx.logger,
								required: !!normalized.requiresRegion,
								config: baseCtx.config ?? null,
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
