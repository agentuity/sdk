import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { resolveHubWsUrl } from './hub-url';

/**
 * Resolve the Coder extension path.
 *
 * Priority:
 *   1. --extension flag (explicit override)
 *   2. AGENTUITY_CODER_EXTENSION env var
 *   3. Installed @agentuity/coder package (node_modules)
 *   4. Local dev path relative to CLI package (SDK monorepo)
 */
function resolveExtensionPath(flagPath?: string): string | null {
	// 1. Explicit flag
	if (flagPath) {
		const resolved = resolve(flagPath);
		if (existsSync(resolved)) return resolved;
		return null;
	}

	// 2. Env var
	const envPath = process.env.AGENTUITY_CODER_EXTENSION;
	if (envPath) {
		const resolved = resolve(envPath);
		if (existsSync(resolved)) return resolved;
	}

	// 3. Installed npm package in cwd
	const cwdNodeModules = resolve(process.cwd(), 'node_modules', '@agentuity', 'coder');
	if (existsSync(cwdNodeModules)) return cwdNodeModules;

	// 4. SDK monorepo sibling (for development)
	// This file is at packages/cli/src/cmd/coder/start.ts — 5 levels up to SDK root
	try {
		const cliDir = dirname(new URL(import.meta.url).pathname);
		const sdkRoot = resolve(cliDir, '..', '..', '..', '..', '..');
		const coderPath = join(sdkRoot, 'packages', 'coder');
		if (existsSync(join(coderPath, 'src', 'index.ts'))) return coderPath;
	} catch {
		// Not in SDK monorepo
	}

	return null;
}

/**
 * Find the `pi` binary.
 *
 * Priority:
 *   1. --pi flag (explicit override)
 *   2. AGENTUITY_CODER_PI_PATH env var
 *   3. `pi` on PATH (default)
 */
function resolvePiBinary(flagPath?: string): string {
	if (flagPath) return flagPath;
	const envPath = process.env.AGENTUITY_CODER_PI_PATH;
	if (envPath) return envPath;
	return 'pi';
}

export const startSubcommand = createSubcommand({
	name: 'start',
	description: 'Start a Pi coding session connected to the Coder Hub',
	tags: ['fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('coder start'),
			description: 'Start Pi with auto-detected Hub and extension',
		},
		{
			command: getCommand('coder start --hub-url ws://127.0.0.1:3500/api/ws'),
			description: 'Start with explicit Hub URL',
		},
		{
			command: getCommand('coder start --extension ~/repos/agentuity/sdk/packages/coder'),
			description: 'Start with explicit extension path',
		},
		{
			command: getCommand('coder start --agent scout'),
			description: 'Start as a specific agent role',
		},
	],
	schema: {
		options: z.object({
			hubUrl: z.string().optional().describe('Hub WebSocket URL override'),
			extension: z.string().optional().describe('Coder extension path override'),
			pi: z.string().optional().describe('Path to pi binary'),
			agent: z.string().optional().describe('Agent role (e.g. scout, builder)'),
			task: z.string().optional().describe('Initial task to execute'),
		}),
	},
	async handler(ctx) {
		const { opts, options } = ctx;

		// Resolve Hub URL
		const hubWsUrl = await resolveHubWsUrl(opts?.hubUrl);
		if (!hubWsUrl) {
			tui.fatal(
				'Could not find a running Coder Hub.\n\nEither:\n  - Start the Hub with: bun run dev\n  - Set AGENTUITY_CODER_HUB_URL environment variable\n  - Pass --hub-url flag',
				ErrorCode.NETWORK_ERROR,
			);
			return;
		}

		// Resolve extension path
		const extensionPath = resolveExtensionPath(opts?.extension);
		if (!extensionPath) {
			tui.fatal(
				'Could not find the Agentuity Coder extension.\n\nEither:\n  - Install it: npm install @agentuity/coder\n  - Set AGENTUITY_CODER_EXTENSION environment variable\n  - Pass --extension flag',
				ErrorCode.CONFIG_INVALID,
			);
			return;
		}

		// Resolve pi binary
		const piBinary = resolvePiBinary(opts?.pi);

		// Build environment
		const env: Record<string, string> = {
			...process.env as Record<string, string>,
			AGENTUITY_CODER_HUB_URL: hubWsUrl,
		};

		if (opts?.agent) {
			env.AGENTUITY_CODER_AGENT = opts.agent;
		}

		// Build pi command args
		const piArgs = ['-e', extensionPath];

		if (!options.json) {
			tui.newline();
			tui.output(`  Hub:       ${tui.bold(hubWsUrl)}`);
			tui.output(`  Extension: ${tui.bold(extensionPath)}`);
			tui.output(`  Pi:        ${tui.bold(piBinary)}`);
			if (opts?.agent) tui.output(`  Agent:     ${tui.bold(opts.agent)}`);
			tui.newline();
		}

		// Spawn pi as a child process, inheriting stdio for interactive TUI
		try {
			const proc = Bun.spawn([piBinary, ...piArgs], {
				env,
				cwd: process.cwd(),
				stdin: 'inherit',
				stdout: 'inherit',
				stderr: 'inherit',
			});

			const exitCode = await proc.exited;
			process.exit(exitCode);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes('ENOENT') || msg.includes('not found')) {
				tui.fatal(
					`Could not find pi binary at '${piBinary}'.\n\nInstall Pi: https://pi.dev\nOr pass --pi flag with the path to the pi binary.`,
					ErrorCode.CONFIG_INVALID,
				);
			} else {
				tui.fatal(`Failed to start Pi: ${msg}`, ErrorCode.NETWORK_ERROR);
			}
		}
	},
});
