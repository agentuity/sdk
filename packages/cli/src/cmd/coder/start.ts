import { dirname, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { z } from 'zod';
import { CoderClient, type CoderSessionListItem } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { toCoderHubWsUrl } from '../../coder-hub-url';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { resolveExtensionPath, resolveExtensionRuntimeModulePath } from './extension-path';
import { probeHubInitAccess } from './tui-init';

/**
 * Find the `pi` binary.
 *
 * Priority:
 *   1. --pi flag (explicit override)
 *   2. AGENTUITY_CODER_PI_PATH env var
 *   3. Bundled pi from coder-tui's node_modules/.bin/pi
 *   4. `pi` on PATH (fallback)
 */
async function resolvePiBinary(flagPath?: string, extensionDir?: string): Promise<string> {
	if (flagPath) return flagPath;
	const envPath = process.env.AGENTUITY_CODER_PI_PATH;
	if (envPath) return envPath;

	// Look for pi bundled with the coder-tui extension
	if (extensionDir) {
		// Prefer require.resolve via package.json — handles hoisted deps, Bun's .bun cache, etc.
		try {
			const pkgJson = require.resolve('@mariozechner/pi-coding-agent/package.json', {
				paths: [extensionDir],
			});
			const piCli = resolve(dirname(pkgJson), 'dist', 'cli.js');
			if (await Bun.file(piCli).exists()) return piCli;
		} catch {
			// Fallback: direct .bin symlink check
			const bundledPi = resolve(extensionDir, 'node_modules', '.bin', 'pi');
			if (await Bun.file(bundledPi).exists()) return bundledPi;
		}
	}

	return 'pi';
}

function logValidationIssues(
	ctx: { logger: { trace: (...args: unknown[]) => void } },
	err: unknown
): void {
	if (err instanceof ValidationOutputError) {
		ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
		ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
	}
}

export const startSubcommand = createSubcommand({
	name: 'tui',
	aliases: ['run', 'start'],
	description: 'Start a coding session connected to Coder',
	tags: ['fast', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder start'),
			description: 'Start Pi with auto-detected Hub and extension',
		},
		{
			command: getCommand('coder start --dir ~/path/to/my/project'),
			description: 'Start from a specific local project directory',
		},
		{
			command: getCommand('coder start --url ws://127.0.0.1:3500/api/ws'),
			description: 'Start with explicit Coder URL',
		},
		{
			command: getCommand('coder start --extension ~/repos/agentuity/sdk/packages/coder-tui'),
			description: 'Start with explicit extension path',
		},
		{
			command: getCommand('coder start --agent scout'),
			description: 'Start as a specific agent role',
		},
		{
			command: getCommand('coder start --remote codesess_abc123456789'),
			description: 'Connect to an existing sandbox session remotely',
		},
		{
			command: getCommand('coder start --remote'),
			description: 'Browse and select a sandbox session to connect to',
		},
		{
			command: getCommand('coder start --sandbox "Build an auth system"'),
			description: 'Create a new sandbox session and attach',
		},
		{
			command: getCommand(
				'coder start --sandbox "Build auth" --repo https://github.com/org/repo'
			),
			description: 'Create a sandbox with a git repo cloned',
		},
	],
	schema: {
		options: z.object({
			dir: z.string().optional().describe('Local project directory to start from'),
			url: z.string().optional().describe('Coder API URL override'),
			extension: z.string().optional().describe('Coder extension path override'),
			pi: z.string().optional().describe('Path to pi binary'),
			agent: z.string().optional().describe('Agent role (e.g. scout, builder)'),
			task: z.string().optional().describe('Initial task to execute'),
			remote: z
				.union([z.boolean(), z.string()])
				.optional()
				.describe('Connect to existing sandbox session (pass session ID or omit for picker)'),
			sandbox: z
				.string()
				.optional()
				.describe('Create a new sandbox session with the given task and attach'),
			repo: z
				.string()
				.optional()
				.describe('Git repo URL to clone in the sandbox (used with --sandbox)'),
		}),
		aliases: {
			remote: ['session'],
		},
	},
	async handler(ctx) {
		const { opts, options } = ctx;

		// Resolve working directory from optional --dir option
		let cwd = process.cwd();
		if (opts?.dir) {
			// Warn if --dir is provided with --remote or --sandbox (dir is ignored in those modes)
			if (opts?.remote !== undefined || opts?.sandbox !== undefined) {
				tui.warning('--dir is ignored in remote/sandbox mode');
			} else {
				const raw = opts.dir.trim();
				cwd =
					raw === '~' || raw.startsWith('~/')
						? resolve(homedir(), raw.slice(2))
						: resolve(raw);

				const st = await stat(cwd).catch(() => null);
				if (!st?.isDirectory()) {
					tui.fatal(
						`The specified path is not a valid directory: ${cwd}`,
						ErrorCode.CONFIG_INVALID
					);
					return;
				}
			}
		}
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		const hubHttpUrl = await client.getUrl();
		const hubWsUrl = toCoderHubWsUrl(hubHttpUrl);

		const initProbe = await probeHubInitAccess(hubHttpUrl, {
			apiKey: ctx.auth.apiKey,
			orgId: ctx.orgId,
		});
		if (!initProbe.ok) {
			tui.fatal(
				`Could not bootstrap the Coder at ${hubHttpUrl}: ${initProbe.message}`,
				ErrorCode.NETWORK_ERROR
			);
			return;
		}

		// Resolve extension path
		const extensionPath = await resolveExtensionPath(opts?.extension);
		if (!extensionPath) {
			tui.fatal(
				'Could not find the Agentuity Coder extension.\n\nThis CLI install should include it automatically. Try:\n  - Reinstall or update @agentuity/cli\n  - Install it locally: npm install @agentuity/coder-tui\n  - Set AGENTUITY_CODER_EXTENSION environment variable\n  - Pass --extension flag',
				ErrorCode.CONFIG_INVALID
			);
			return;
		}

		const loadRemoteTui = async () => {
			const modulePath = await resolveExtensionRuntimeModulePath(extensionPath);
			if (!modulePath) {
				throw new Error(
					`Coder extension at ${extensionPath} is missing the remote TUI entrypoint`
				);
			}
			return import(modulePath);
		};

		// Resolve pi binary
		const piBinary = await resolvePiBinary(opts?.pi, extensionPath);

		// ── Remote mode: resolve session ID ──
		let remoteSessionId: string | undefined;
		if (opts?.remote !== undefined) {
			// --remote was passed (might be bare flag → boolean true, or a session ID string)
			const remoteValue = typeof opts.remote === 'string' ? opts.remote.trim() : '';
			if (remoteValue) {
				remoteSessionId = remoteValue;
			} else {
				// No session ID — fetch connectable sessions and show picker
				try {
					const sessions = await tui.spinner({
						message: 'Fetching connectable sessions…',
						callback: async () => (await client.listConnectableSessions()).sessions,
					});

					if (sessions.length === 0) {
						tui.fatal(
							`No connectable sandbox sessions found.\n\nCreate one with:\n  ${getCommand('coder start --sandbox "your task"')}`,
							ErrorCode.CONFIG_INVALID
						);
						return;
					}

					const prompt = tui.createPrompt();
					remoteSessionId = await prompt.select<string>({
						message: 'Select a sandbox session to connect to',
						options: sessions.map((s: CoderSessionListItem) => {
							const age = timeSince(new Date(s.createdAt));
							const label = `${s.label} ${tui.muted(`(${s.status}, ${age})`)}`;
							return {
								value: s.sessionId,
								label,
								hint: s.sessionId,
							};
						}),
					});
				} catch (err) {
					logValidationIssues(ctx, err);
					const msg = err instanceof Error ? err.message : String(err);
					if (msg === 'User cancelled') return;
					tui.fatal(`Failed to fetch connectable sessions: ${msg}`, ErrorCode.NETWORK_ERROR);
					return;
				}
			}
		}

		// ── Remote mode: native Pi TUI backed by Hub WebSocket ──
		// Uses remote-tui.ts which creates AgentSession + InteractiveMode directly,
		// with the coder extension loaded for Hub UI (footer, /hub, commands).
		// Agent.emit() drives native rendering — no [remote_message] blocks.
		if (remoteSessionId) {
			try {
				const session = await tui.spinner({
					message: 'Preparing remote session…',
					callback: async () => client.prepareSessionForRemoteAttach(remoteSessionId!),
				});

				if (session.historyOnly === true) {
					tui.fatal(
						`Session ${remoteSessionId} is history-only and cannot be attached remotely.`,
						ErrorCode.CONFIG_INVALID
					);
					return;
				}

				if (session.runtimeAvailable === false) {
					tui.fatal(
						`Session ${remoteSessionId} is offline and could not be resumed for remote attach.`,
						ErrorCode.NETWORK_ERROR
					);
					return;
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				tui.fatal(`Failed to prepare remote session: ${msg}`, ErrorCode.NETWORK_ERROR);
				return;
			}

			if (!options.json) {
				tui.newline();
				tui.output(`  Hub:       ${tui.bold(hubWsUrl)}`);
				tui.output(`  Extension: ${tui.bold(extensionPath)}`);
				tui.output(`  Remote:    ${tui.bold(remoteSessionId)}`);
				tui.newline();
			}

			try {
				const { runRemoteTui } = await loadRemoteTui();
				await runRemoteTui({
					hubWsUrl,
					sessionId: remoteSessionId,
					apiKey: ctx.auth.apiKey,
					orgId: ctx.orgId,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				tui.fatal(`Remote TUI failed: ${msg}`, ErrorCode.NETWORK_ERROR);
			}
			return;
		}

		// ── Sandbox mode: create sandbox + attach ──
		if (opts?.sandbox !== undefined) {
			const task = opts.sandbox?.trim();
			if (!task) {
				tui.fatal(
					'--sandbox requires a task description.\n\nExample: --sandbox "Build an authentication system"',
					ErrorCode.CONFIG_INVALID
				);
				return;
			}

			// Build request body
			const body: {
				task: string;
				repo?: { url: string };
			} = { task };
			if (opts?.repo) {
				body.repo = { url: opts.repo };
			}

			// Create sandbox session via Hub API
			tui.newline();
			tui.output(`  Creating sandbox session...`);

			let sessionId: string;
			try {
				const sessionInfo = await client.createSession(body);
				sessionId = sessionInfo.sessionId;
			} catch (err) {
				logValidationIssues(ctx, err);
				const msg = err instanceof Error ? err.message : String(err);
				tui.fatal(`Failed to create sandbox session: ${msg}`, ErrorCode.NETWORK_ERROR);
				return;
			}

			tui.output(`  Session:   ${tui.bold(sessionId)}`);
			tui.output(`  Task:      ${task.slice(0, 80)}`);
			if (opts?.repo) tui.output(`  Repo:      ${opts.repo}`);
			tui.output(`  Waiting for sandbox driver to connect...`);

			// Poll until driver (lead) connects
			const POLL_TIMEOUT = 120_000; // 2 min (matches Hub's DRIVER_CONNECT_TIMEOUT)
			const POLL_INTERVAL = 2_000;
			const pollStart = Date.now();
			let driverConnected = false;

			while (Date.now() - pollStart < POLL_TIMEOUT) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
				try {
					const data = await client.listParticipants(sessionId);
					if (data.participants?.some((p) => p.role === 'lead')) {
						driverConnected = true;
						break;
					}
				} catch {
					// Network blip — keep polling
				}
			}

			if (!driverConnected) {
				tui.fatal(
					`Sandbox driver did not connect within ${POLL_TIMEOUT / 1000}s.\n\nThe sandbox may still be starting. Try attaching later with:\n  ${getCommand(`coder start --remote ${sessionId}`)}`,
					ErrorCode.NETWORK_ERROR
				);
				return;
			}

			tui.output(`  Driver connected. Attaching...`);
			tui.newline();

			try {
				const { runRemoteTui } = await loadRemoteTui();
				await runRemoteTui({
					hubWsUrl,
					sessionId,
					apiKey: ctx.auth.apiKey,
					orgId: ctx.orgId,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				tui.fatal(`Remote TUI failed: ${msg}`, ErrorCode.NETWORK_ERROR);
			}
			return;
		}

		// ── Normal mode: spawn pi with extension ──
		const env: Record<string, string> = {
			...(process.env as Record<string, string>),
			AGENTUITY_CODER_HUB_URL: hubWsUrl,
		};
		env.AGENTUITY_CODER_API_KEY = ctx.auth.apiKey;

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
			if (opts?.dir) tui.output(`  Dir:       ${tui.bold(cwd)}`);
			if (opts?.agent) tui.output(`  Agent:     ${tui.bold(opts.agent)}`);
			tui.newline();
		}

		// Spawn pi as a child process, inheriting stdio for interactive TUI
		try {
			const proc = Bun.spawn([piBinary, ...piArgs], {
				env,
				cwd,
				stdin: 'inherit',
				stdout: 'inherit',
				stderr: 'inherit',
			});

			// Forward signals to the child process so Ctrl+C exits cleanly
			const onSigInt = () => proc.kill(2);
			const onSigTerm = () => proc.kill(15);
			process.on('SIGINT', onSigInt);
			process.on('SIGTERM', onSigTerm);

			const exitCode = await proc.exited;

			// Clean up only our signal handlers (preserve other modules' listeners)
			process.removeListener('SIGINT', onSigInt);
			process.removeListener('SIGTERM', onSigTerm);

			process.exit(exitCode);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes('ENOENT') || msg.includes('not found')) {
				tui.fatal(
					`Could not find pi binary at '${piBinary}'.\n\nInstall Pi: https://pi.dev\nOr pass --pi flag with the path to the pi binary.`,
					ErrorCode.CONFIG_INVALID
				);
			} else {
				tui.fatal(`Failed to start Pi: ${msg}`, ErrorCode.NETWORK_ERROR);
			}
		}
	},
});

/** Format a duration since a given date. */
function timeSince(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
