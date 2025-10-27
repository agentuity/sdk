#!/usr/bin/env bun
import { createCLI, registerCommands } from '../src/cli';
import { validateRuntime } from '../src/runtime';
import { loadConfig } from '../src/config';
import { discoverCommands } from '../src/cmd';
import { logger } from '../src/logger';
import { detectColorScheme } from '../src/terminal';
import { getVersion } from '../src/version';
import type { LogLevel } from '../src/types';

validateRuntime();

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

// Debug: show detected color scheme
if (process.env.DEBUG_COLORS) {
	console.log(`[DEBUG] Color scheme: ${colorScheme}`);
}

// Configure logger with global options
logger.setLevel((earlyOpts.logLevel as LogLevel) || 'info');
logger.setTimestamp(earlyOpts.logTimestamp || false);

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
await registerCommands(program, commands, ctx);

try {
	await program.parseAsync(process.argv);
} catch (error) {
	logger.error('CLI error:', error);
	process.exit(1);
}
