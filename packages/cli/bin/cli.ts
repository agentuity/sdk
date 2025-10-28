#!/usr/bin/env bun
import { createCLI, registerCommands } from '../src/cli';
import { validateRuntime } from '../src/runtime';
import { loadConfig } from '../src/config';
import { discoverCommands } from '../src/cmd';
import { logger } from '../src/logger';
import { detectColorScheme } from '../src/terminal';
import { setColorScheme } from '../src/tui';
import { getVersion } from '../src/version';
import { checkLegacyCLI } from '../src/legacy-check';
import type { CommandContext, LogLevel } from '../src/types';

// Cleanup TTY state before exit
function cleanupAndExit() {
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
		process.stdout.write('\x1B[?25h'); // Restore cursor
	}
	process.exitCode = 0;
	process.exit(0);
}

// Handle Ctrl+C gracefully
process.once('SIGINT', () => {
	console.log('\n');
	cleanupAndExit();
});

process.once('SIGTERM', () => {
	cleanupAndExit();
});

validateRuntime();

// Check for legacy CLI and warn user (skip if --skip-legacy-check flag is present)
const skipLegacyCheck = process.argv.includes('--skip-legacy-check');
if (!skipLegacyCheck) {
	await checkLegacyCLI();
}

const version = getVersion();

const program = await createCLI(version);

// Parse options early to check for color scheme override
program.parseOptions(process.argv);
const earlyOpts = program.opts();

// Detect or override terminal color scheme
let colorScheme = await detectColorScheme();
if (earlyOpts.colorScheme === 'light' || earlyOpts.colorScheme === 'dark') {
	colorScheme = earlyOpts.colorScheme;
	if (process.env.DEBUG_COLORS) {
		console.log(`[DEBUG] Using --color-scheme=${colorScheme} flag`);
	}
}
logger.setColorScheme(colorScheme);
setColorScheme(colorScheme);

// Debug: show detected color scheme
if (process.env.DEBUG_COLORS) {
	console.log(`[DEBUG] Color scheme: ${colorScheme}`);
}

// Configure logger with global options
logger.setLevel((earlyOpts.logLevel as LogLevel) || 'info');
logger.setTimestamp(earlyOpts.logTimestamp || false);
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

const commands = await discoverCommands();
await registerCommands(program, commands, ctx as unknown as CommandContext);

try {
	await program.parseAsync(process.argv);
} catch (error) {
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
			process.exit(0);
		}
		if ('name' in error && error.name === 'AbortError') {
			process.exit(0);
		}
	}
	// Also exit cleanly if error is empty/undefined (user cancellation)
	if (!error) {
		process.exit(0);
	}
	logger.error('CLI error:', error);
	process.exit(1);
}
