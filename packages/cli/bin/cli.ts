#!/usr/bin/env bun
// Debug: CLI startup tracing
const CLI_DEBUG = process.env.AGENTUITY_CLI_DEBUG === '1' || process.env.CI === 'true';
const debugLog = (msg: string) => {
	if (CLI_DEBUG) console.error(`[CLI-TRACE] ${msg}`);
};
debugLog('CLI starting...');
debugLog(`argv: ${JSON.stringify(process.argv)}`);
debugLog(`AGENTUITY_SKIP_LEGACY_CHECK: ${process.env.AGENTUITY_SKIP_LEGACY_CHECK}`);
debugLog(`AGENTUITY_SKIP_VERSION_CHECK: ${process.env.AGENTUITY_SKIP_VERSION_CHECK}`);

import { ConsoleLogger } from '@agentuity/server';
debugLog('Imported @agentuity/server');
import { isStructuredError } from '@agentuity/core';
debugLog('Imported @agentuity/core');
import { createCLI, registerCommands } from '../src/cli';
debugLog('Imported ../src/cli');
import { validateRuntime } from '../src/runtime';
debugLog('Imported ../src/runtime');
import { loadConfig } from '../src/config';
debugLog('Imported ../src/config');
import { discoverCommands } from '../src/cmd';
debugLog('Imported ../src/cmd');
import { detectColorScheme } from '../src/terminal';
debugLog('Imported ../src/terminal');
import { setColorScheme } from '../src/tui';
debugLog('Imported ../src/tui');
import { getVersion } from '../src/version';
debugLog('Imported ../src/version');
import { checkLegacyCLI } from '../src/legacy-check';
debugLog('Imported ../src/legacy-check');
import type { CommandContext, LogLevel } from '../src/types';
import { generateCLISchema } from '../src/schema-generator';
debugLog('Imported ../src/schema-generator');
import { setOutputOptions } from '../src/output';
debugLog('Imported ../src/output');
import type { GlobalOptions } from '../src/types';
import { ensureBunOnPath } from '../src/bun-path';
debugLog('Imported ../src/bun-path');
import { checkForUpdates } from '../src/version-check';
debugLog('All imports complete');

// Cleanup TTY state before exit
function cleanupTTY() {
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

debugLog('Calling validateRuntime()...');
validateRuntime();
debugLog('validateRuntime() passed');

debugLog('Calling ensureBunOnPath()...');
await ensureBunOnPath();
debugLog('ensureBunOnPath() complete');

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
debugLog(`preprocessedArgs: ${JSON.stringify(preprocessedArgs)}`);

const helpFlags = ['--help', '-h', 'help'];
const hasHelp = helpFlags.some((flag) => preprocessedArgs.includes(flag));
debugLog(`hasHelp: ${hasHelp}`);

// Check for --help=json early (needs to exit before full initialization)
// After preprocessing, --help=json becomes ['--help', 'json'] (length 2)
if (
	preprocessedArgs.length === 2 &&
	preprocessedArgs[0] === '--help' &&
	preprocessedArgs[1] === 'json'
) {
	debugLog('Handling --help=json');
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
debugLog(`skipLegacyCheck: ${skipLegacyCheck}`);
if (!skipLegacyCheck) {
	debugLog('Running checkLegacyCLI()...');
	await checkLegacyCLI();
	debugLog('checkLegacyCLI() complete');
}

debugLog('Getting version...');
const version = getVersion();
debugLog(`version: ${version}`);

debugLog('Creating CLI program...');
const program = await createCLI(version);
debugLog('CLI program created');

// Parse options early to check for color scheme override
// Skip parseOptions if we have help flags to avoid "unknown option" error
if (!hasHelp) {
	debugLog('Parsing options...');
	program.parseOptions(process.argv);
	debugLog('Options parsed');
}
const earlyOpts = program.opts();
debugLog(`earlyOpts keys: ${Object.keys(earlyOpts).join(', ')}`);

// Detect or override terminal color scheme
debugLog('Detecting color scheme...');
let colorScheme = await detectColorScheme();
if (earlyOpts.colorScheme === 'light' || earlyOpts.colorScheme === 'dark') {
	colorScheme = earlyOpts.colorScheme;
	if (process.env.DEBUG_COLORS) {
		console.log(`[DEBUG] Using --color-scheme=${colorScheme} flag`);
	}
}
setColorScheme(colorScheme);
debugLog(`colorScheme: ${colorScheme}`);

// Debug: show detected color scheme
if (process.env.DEBUG_COLORS) {
	console.log(`[DEBUG] Color scheme: ${colorScheme}`);
}

// Create logger instance with global options
// In quiet or JSON mode, suppress most logging
const effectiveLogLevel =
	earlyOpts.quiet || earlyOpts.json ? 'error' : (earlyOpts.logLevel as LogLevel) || 'info';
debugLog(`effectiveLogLevel: ${effectiveLogLevel}`);
const logger = new ConsoleLogger(effectiveLogLevel, earlyOpts.logTimestamp || false, colorScheme);
logger.setShowPrefix(earlyOpts.logPrefix !== false);

// Set version check skip flag from CLI option
if (earlyOpts.skipVersionCheck) {
	process.env.AGENTUITY_SKIP_VERSION_CHECK = '1';
}

debugLog('Loading config...');
const config = await loadConfig(earlyOpts.config);
debugLog('Config loaded');

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

debugLog('Discovering commands...');
const commands = await discoverCommands();
debugLog(`Found ${commands.length} commands`);

// Check for updates before running commands (may upgrade and re-exec)
// Find the command being run to check if it opts out of upgrade check
const commandName = preprocessedArgs.find((arg) => !arg.startsWith('-'));
debugLog(`commandName: ${commandName}`);
const commandDef = commands.find((cmd) => cmd.name === commandName);
debugLog(`commandDef found: ${!!commandDef}`);

debugLog('Checking for updates...');
await checkForUpdates(config, logger, earlyOpts, commandDef, preprocessedArgs);
debugLog('Update check complete');

// Generate and store CLI schema globally for the schema command
debugLog('Generating CLI schema...');
const cliSchema = generateCLISchema(program, commands, version);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__CLI_SCHEMA__ = cliSchema;
debugLog('CLI schema generated');

debugLog('Registering commands...');
await registerCommands(program, commands, ctx as unknown as CommandContext);
debugLog('Commands registered');

debugLog('Parsing command...');
try {
	await program.parseAsync(process.argv);
	debugLog('Command completed successfully');
} catch (error) {
	debugLog(`Command threw error: ${error}`);
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
