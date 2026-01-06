#!/usr/bin/env bun
import { ConsoleLogger } from '@agentuity/server';
import { isStructuredError } from '@agentuity/core';
import { createCLI, registerCommands } from '../src/cli';
import { validateRuntime } from '../src/runtime';
import { loadConfig } from '../src/config';
import { discoverCommands } from '../src/cmd';
import { detectColorScheme } from '../src/terminal';
import { setColorScheme } from '../src/tui';
import { getVersion } from '../src/version';
import { checkLegacyCLI } from '../src/legacy-check';
import type { CommandContext, LogLevel } from '../src/types';
import { generateCLISchema } from '../src/schema-generator';
import { setOutputOptions } from '../src/output';
import type { GlobalOptions } from '../src/types';
import { ensureBunOnPath } from '../src/bun-path';
import { checkForUpdates } from '../src/version-check';

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
});

process.on('SIGTERM', () => {
	cleanupTTY();
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
	exit(0);
}

// Check for legacy CLI and warn user (skip via flag or env var)
// Env var is preferred for programmatic use (e.g., test runners) since Commander.js
// would fail on unknown CLI flags
const skipLegacyCheck =
	process.argv.includes('--skip-legacy-check') || process.env.AGENTUITY_SKIP_LEGACY_CHECK === '1';
if (!skipLegacyCheck) {
	await checkLegacyCLI();
}

const version = getVersion();
const program = await createCLI(version);

// Parse options early to check for color scheme override
// Skip parseOptions if we have help flags to avoid "unknown option" error
if (!hasHelp) {
	program.parseOptions(process.argv);
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
const logger = new ConsoleLogger(effectiveLogLevel, earlyOpts.logTimestamp || false, colorScheme);
logger.setShowPrefix(earlyOpts.logPrefix !== false);

// Set version check skip flag from CLI option
if (earlyOpts.skipVersionCheck) {
	process.env.AGENTUITY_SKIP_VERSION_CHECK = '1';
}

const config = await loadConfig(earlyOpts.config);

const ctx = {
	config,
	logger,
	options: earlyOpts,
};

// Set global output options for utilities to use
// When --json is used, automatically set error format to json
if (earlyOpts.json && !earlyOpts.errorFormat) {
	earlyOpts.errorFormat = 'json';
}
setOutputOptions(earlyOpts as GlobalOptions);

const commands = await discoverCommands();

// Check for updates before running commands (may upgrade and re-exec)
// Find the command being run to check if it opts out of upgrade check
const commandName = preprocessedArgs.find((arg) => !arg.startsWith('-'));
const commandDef = commands.find((cmd) => cmd.name === commandName);

await checkForUpdates(config, logger, earlyOpts, commandDef, preprocessedArgs);

// Generate and store CLI schema globally for the schema command
const cliSchema = generateCLISchema(program, commands, version);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__CLI_SCHEMA__ = cliSchema;

await registerCommands(program, commands, ctx as unknown as CommandContext);

try {
	await program.parseAsync(process.argv);
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
			exit(0);
		}
		if ('name' in error && error.name === 'AbortError') {
			exit(0);
		}
	}
	// Also exit cleanly if error is empty/undefined (user cancellation)
	if (!error) {
		exit(0);
	}
	const errorWithMessage = error as { message?: string };
	if (isStructuredError(error)) {
		logger.error(error);
	} else {
		logger.error(
			'CLI error: %s %s',
			errorWithMessage?.message ? errorWithMessage.message : String(error),
			error
		);
	}
	exit(1);
}
