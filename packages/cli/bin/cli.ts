#!/usr/bin/env bun

// Fast-path for version command - check before loading heavy modules
const versionArgs = process.argv.slice(2);
if (versionArgs.length === 1 && ['version', '-v', '--version', '-V'].includes(versionArgs[0])) {
	const { getVersion } = await import('../src/version');
	console.log(getVersion());
	process.exit(0);
}

import { ConsoleLogger, getAppBaseURL } from '@agentuity/server';
import { isStructuredError } from '@agentuity/core';
import { createCLI, registerCommands } from '../src/cli';
import { validateRuntime } from '../src/runtime';
import { loadConfig } from '../src/config';
import { discoverCommands } from '../src/cmd';
import { detectColorScheme } from '../src/terminal';
import { setColorScheme } from '../src/tui';
import { getVersion, getPackageName } from '../src/version';

import type { CommandContext, LogLevel } from '../src/types';
import { generateCLISchema } from '../src/schema-generator';
import { generateAIHelp } from '../src/ai-help';
import { setOutputOptions } from '../src/output';
import type { GlobalOptions } from '../src/types';
import { ensureBunOnPath } from '../src/bun-path';
import { checkForUpdates } from '../src/version-check';
import { closeDatabase } from '../src/cache';
import { ErrorCode, createError, formatErrorJSON } from '../src/errors';
import { createInternalLogger } from '../src/internal-logger';
import { createCompositeLogger } from '../src/composite-logger';
import { getAuth } from '../src/config';
import { getExecutingAgent } from '../src/agent-detection';

/**
 * Extract --dir flag from process.argv before command parsing
 * Handles both --dir=<path> and --dir <path> formats
 * Returns undefined if not present
 */
function getProjectDirFromArgs(): string | undefined {
	const args = process.argv;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		// Handle --dir=<path>
		if (arg.startsWith('--dir=')) {
			return arg.slice(6);
		}

		// Handle --dir <path>
		if (arg === '--dir' && i + 1 < args.length) {
			const nextArg = args[i + 1];
			// Make sure next arg isn't another flag
			if (!nextArg.startsWith('-')) {
				return nextArg;
			}
		}
	}

	return undefined;
}

// Cleanup TTY state before exit
function cleanupTTY() {
	// Skip in CI - terminals don't support cursor control sequences
	if (process.env.CI) {
		return;
	}
	if (process.stdin.isTTY) {
		try {
			process.stdin.setRawMode(false);
		} catch {
			// Ignore errors if stdin is already closed
		}
		process.stdout.write('\x1B[?25h'); // Restore cursor
	}
}

// Handle Ctrl+C gracefully - only cleanup TTY, let command handlers run
// Commands like 'dev' register their own SIGINT handlers for cleanup
process.on('SIGINT', () => {
	process.stdout.write('\b \b'); // erase the ctrl+c display
	cleanupTTY();
	closeDatabase();
});

process.on('SIGTERM', () => {
	cleanupTTY();
	closeDatabase();
});

validateRuntime();
await ensureBunOnPath();

// Preprocess arguments to convert --help=json to --help json
// Commander.js doesn't support --option=value syntax for optional values
const preprocessedArgs = process.argv.slice(2).flatMap((arg) => {
	if (arg === '--help=json') {
		return ['--help', 'json'];
	}
	return arg;
});
// Preserve the original process.argv[0] (runtime) and process.argv[1] (script path)
// This is important for Bun, Node, and bundled executables
process.argv = [process.argv[0], process.argv[1], ...preprocessedArgs];

const helpFlags = ['--help', '-h', 'help'];
const hasHelp = helpFlags.some((flag) => preprocessedArgs.includes(flag));

// Check for --help=json early (needs to exit before full initialization)
// After preprocessing, --help=json becomes ['--help', 'json'] (length 2)
if (
	preprocessedArgs.length === 2 &&
	preprocessedArgs[0] === '--help' &&
	preprocessedArgs[1] === 'json'
) {
	const version = getVersion();
	const program = await createCLI(version);
	const commands = await discoverCommands();
	const cliSchema = generateCLISchema(program, commands, version);
	console.log(JSON.stringify(cliSchema, null, 2));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const exit = (globalThis as any).AGENTUITY_PROCESS_EXIT || process.exit;
	closeDatabase();
	exit(0);
}

// Check for --ai-help early (dashdash format for AI agents)
// This runs before auth/validation per dashdash spec "eager" requirement
if (preprocessedArgs.includes('--ai-help')) {
	const version = getVersion();
	const program = await createCLI(version);
	const commands = await discoverCommands();
	const cliSchema = generateCLISchema(program, commands, version);
	const aiHelp = generateAIHelp(cliSchema);
	console.log(aiHelp);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const exit = (globalThis as any).AGENTUITY_PROCESS_EXIT || process.exit;
	closeDatabase();
	exit(0);
}

const version = getVersion();
const program = await createCLI(version);

// Parse options early to check for color scheme override and extract operands
// Skip parseOptions if we have help flags to avoid "unknown option" error
// parseOptions returns { operands, unknown } where operands are positional args (command names)
// Pass only user args (slice(2) to skip node path and script path) per Commander v14 expectations
let parsedOperands: string[] = [];
if (!hasHelp) {
	const parsed = program.parseOptions(process.argv.slice(2));
	parsedOperands = parsed.operands;
}
const earlyOpts = program.opts();

// Detect or override terminal color scheme
let colorScheme = await detectColorScheme();
if (earlyOpts.colorScheme === 'light' || earlyOpts.colorScheme === 'dark') {
	colorScheme = earlyOpts.colorScheme;
	if (process.env.DEBUG_COLORS) {
		console.log(`[DEBUG] Using --color-scheme=${colorScheme} flag`);
	}
}
setColorScheme(colorScheme);

// Debug: show detected color scheme
if (process.env.DEBUG_COLORS) {
	console.log(`[DEBUG] Color scheme: ${colorScheme}`);
}

// Create logger instance with global options
// In quiet or JSON mode, suppress most logging
const effectiveLogLevel =
	earlyOpts.quiet || earlyOpts.json ? 'error' : (earlyOpts.logLevel as LogLevel) || 'info';
const consoleLogger = new ConsoleLogger(
	effectiveLogLevel,
	earlyOpts.logTimestamp || false,
	colorScheme
);
consoleLogger.setShowPrefix(earlyOpts.logPrefix !== false);

// Use the parsed operands from Commander.js parseOptions() which correctly
// separates command names from option values. parsedOperands contains only
// positional arguments (command/subcommand names), not flag values.
// For help mode, parsedOperands is empty so we fall back to extracting from preprocessedArgs.
const commandArgs = hasHelp
	? preprocessedArgs.filter((arg) => !arg.startsWith('-'))
	: parsedOperands;

// Check if we should skip internal logging based on command or help flags
// We need to check the commands first to see if skipInternalLogging is set
const earlyCommandName = commandArgs[0];
const earlySubcommandName = commandArgs[1];
const commands = await discoverCommands();
const earlyCommandDef = commands.find((cmd) => cmd.name === earlyCommandName);
const earlySubcommandDef = earlySubcommandName
	? earlyCommandDef?.subcommands?.find((sub) => sub.name === earlySubcommandName)
	: undefined;

// Skip internal logging if:
// 1. Help flag is present
// 2. No command provided (shows help)
// 3. Command has skipInternalLogging set
// 4. Subcommand has skipInternalLogging set
const shouldSkipInternalLogging =
	hasHelp ||
	commandArgs.length === 0 ||
	earlyCommandDef?.skipInternalLogging ||
	earlySubcommandDef?.skipInternalLogging;

// Create internal logger for trace/debug logging (always at trace level)
const internalLogger = createInternalLogger(version, getPackageName());

// Disable or initialize the internal logger based on command flags
if (shouldSkipInternalLogging) {
	internalLogger.disable();
} else {
	const command = commandArgs.length > 0 ? commandArgs.join(' ') : 'help';
	// Extract --dir from argv if present (for project context in logs)
	const projectDirArg = getProjectDirFromArgs();
	// Filter out command/subcommand names from args by position, not by value.
	// The first N entries of preprocessedArgs that are not flags are the command tokens.
	// Skip the leading command tokens to get only the actual arguments.
	let commandTokensToSkip = commandArgs.length;
	const filteredArgs: string[] = [];
	for (const arg of preprocessedArgs) {
		if (commandTokensToSkip > 0 && !arg.startsWith('-') && commandArgs.includes(arg)) {
			commandTokensToSkip--;
		} else {
			filteredArgs.push(arg);
		}
	}
	internalLogger.init(command, filteredArgs, undefined, projectDirArg);

	// Set session ID in environment so forked child processes can share the same log file
	process.env.AGENTUITY_INTERNAL_SESSION_ID = internalLogger.getSessionId();

	// Set detected agent in session logs
	const detectedAgent = getExecutingAgent();
	if (detectedAgent) {
		internalLogger.setDetectedAgent(detectedAgent);
	}
}

// Create composite logger that writes to both console and internal log
const logger = createCompositeLogger(consoleLogger, internalLogger);

// Set version check skip flag from CLI option
if (earlyOpts.skipVersionCheck) {
	process.env.AGENTUITY_SKIP_VERSION_CHECK = '1';
}

const config = await loadConfig(earlyOpts.config, false, earlyOpts.profile);

// Update internal logger with userId if available from auth (keychain or config)
try {
	const auth = await getAuth();
	if (auth?.userId) {
		internalLogger.setUserId(auth.userId);
	}
} catch {
	// Ignore auth errors - user might not be logged in
}

const ctx = {
	config,
	logger,
	options: earlyOpts,
	getExecutingAgent,
};

// Set global output options for utilities to use
// When --json is used, automatically set error format to json
if (earlyOpts.json && earlyOpts.errorFormat !== 'json') {
	earlyOpts.errorFormat = 'json';
}
setOutputOptions(earlyOpts as GlobalOptions);

// Check for updates before running commands (may upgrade and re-exec)
// Find the command being run to check if it opts out of upgrade check
// Use parsedOperands from Commander's parseOptions which correctly separates
// command names from option values (e.g., "--file myfile" won't treat "myfile" as a command)
// Also find the subcommand if present (e.g., "auth whoami" -> command="auth", subcommand="whoami")
const commandName = parsedOperands[0];
const subcommandName = parsedOperands[1];
const commandDef = commands.find((cmd) => cmd.name === commandName);
const subcommandDef = subcommandName
	? commandDef?.subcommands?.find((sub) => sub.name === subcommandName)
	: undefined;

await checkForUpdates(config, logger, earlyOpts, commandDef, subcommandDef, preprocessedArgs);

// Generate and store CLI schema globally for the schema command
const cliSchema = generateCLISchema(program, commands, version);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__CLI_SCHEMA__ = cliSchema;

await registerCommands(program, commands, ctx as unknown as CommandContext);

try {
	await program.parseAsync(process.argv);
	// Ensure clean exit after successful command execution.
	// In TTY environments, process.stdin may keep the event loop alive
	// (e.g., after confirm() calls resume()/setRawMode()), and Bun does not
	// support process.stdin.unref(), so we must explicitly exit.
	closeDatabase();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const exit = (globalThis as any).AGENTUITY_PROCESS_EXIT || process.exit;
	exit(0);
} catch (error) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const exit = (globalThis as any).AGENTUITY_PROCESS_EXIT || process.exit;
	// Don't log error if it's from Ctrl+C, user cancellation, or signal termination
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		if (
			msg.includes('sigint') ||
			msg.includes('sigterm') ||
			msg.includes('user force closed') ||
			msg.includes('cancelled') || // UK
			msg.includes('canceled') || // US
			msg === ''
		) {
			closeDatabase();
			exit(0);
		}
		if ('name' in error && error.name === 'AbortError') {
			closeDatabase();
			exit(0);
		}
	}
	// Also exit cleanly if error is empty/undefined (user cancellation)
	if (!error) {
		closeDatabase();
		exit(0);
	}
	const errorWithMessage = error as { message?: string; statusCode?: number; _tag?: string };

	// Handle payment required (402) errors with a friendly TUI message
	if (
		isStructuredError(error) &&
		((errorWithMessage._tag === 'ServiceException' && errorWithMessage.statusCode === 402) ||
			errorWithMessage._tag === 'PaymentRequiredError')
	) {
		if (earlyOpts.errorFormat === 'json') {
			console.error(
				formatErrorJSON(
					createError(
						ErrorCode.PAYMENT_REQUIRED,
						'Your organization is out of credit. Please visit your billing page to add credit.'
					)
				)
			);
		} else {
			const { errorBox, link, newline } = await import('../src/tui');
			const overrides = config?.overrides as { app_url?: string } | undefined;
			const appBaseUrl = getAppBaseURL(undefined, overrides);
			const billingUrl = `${appBaseUrl}/billing`;
			newline();
			errorBox(
				'Out of Credit',
				`Your organization is out of credit.\n\nPlease add more here:\n${link(billingUrl)}`,
				false // standalone box, not connected to a guide
			);
		}
		closeDatabase();
		exit(1);
	}

	if (earlyOpts.errorFormat === 'json') {
		let message = errorWithMessage?.message ?? String(error);
		const code = isStructuredError(error) ? ErrorCode.API_ERROR : ErrorCode.INTERNAL_ERROR;
		const details: Record<string, unknown> = {};
		if (isStructuredError(error) && errorWithMessage._tag) {
			details.tag = errorWithMessage._tag;
		}
		if (typeof error === 'object' && error !== null) {
			if ('status' in error && typeof (error as any).status === 'number') {
				details.status = (error as any).status;
			}
			if ('sessionId' in error && (error as any).sessionId) {
				details.sessionId = (error as any).sessionId;
			}
		}
		// Try to parse embedded JSON in API error messages
		// API errors often have messages like: '{"success":false,"message":"not found: ..."}'
		try {
			const parsed = JSON.parse(message);
			if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string') {
				message = parsed.message;
			}
		} catch {
			// Not JSON, use message as-is
		}
		console.error(
			formatErrorJSON(
				createError(code, message, Object.keys(details).length > 0 ? details : undefined)
			)
		);
	} else if (isStructuredError(error)) {
		logger.error(error);
	} else {
		logger.error(
			'CLI error: %s %s',
			errorWithMessage?.message ? errorWithMessage.message : String(error),
			error
		);
	}
	closeDatabase();
	exit(1);
}
