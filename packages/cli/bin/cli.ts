#!/usr/bin/env bun
import { createCLI, registerCommands } from '../src/cli';
import { validateRuntime } from '../src/runtime';
import { loadConfig } from '../src/config';
import { discoverCommands } from '../src/cmd';
import { logger } from '../src/logger';
import { detectColorScheme } from '../src/terminal';
import type { LogLevel } from '../src/types';

validateRuntime();

const pkg = await import('../package.json');
const version = pkg.version;

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
