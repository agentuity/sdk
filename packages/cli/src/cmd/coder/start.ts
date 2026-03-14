import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { resolveHubWsUrl, resolveHubUrl, hubFetchHeaders } from './hub-url';
import { inspectPiBinaryVersion, SUPPORTED_PI_VERSION_RANGE } from './pi-version';
import { probeTuiInitAccess } from './tui-init';

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
		{
			command: getCommand('coder start --remote codesess_abc123'),
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
			hubUrl: z.string().optional().describe('Hub WebSocket URL override'),
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
	},
	async handler(ctx) {
		const { opts, options } = ctx;

		// Resolve Hub URL
		const hubWsUrl = await resolveHubWsUrl(opts?.hubUrl);
		const hubHttpUrl = await resolveHubUrl(opts?.hubUrl);
		if (!hubWsUrl) {
			tui.fatal(
				'Could not find a running Coder Hub.\n\nEither:\n  - Start the Hub with: bun run dev\n  - Set AGENTUITY_CODER_HUB_URL environment variable\n  - Pass --hub-url flag',
				ErrorCode.NETWORK_ERROR
			);
			return;
		}
		if (!hubHttpUrl) {
			tui.fatal('Could not resolve the Coder Hub HTTP URL.', ErrorCode.NETWORK_ERROR);
			return;
		}

		const tuiInitProbe = await probeTuiInitAccess(hubHttpUrl);
		if (!tuiInitProbe.ok) {
			if (tuiInitProbe.code === 'unauthorized') {
				tui.fatal(
					`Coder Hub at ${hubHttpUrl} requires authentication.\n\nSet AGENTUITY_CODER_API_KEY in your shell and retry.\n\nServer said: ${tuiInitProbe.message}`,
					ErrorCode.NETWORK_ERROR
				);
				return;
			}

			tui.fatal(
				`Could not bootstrap the Coder Hub at ${hubHttpUrl}: ${tuiInitProbe.message}`,
				ErrorCode.NETWORK_ERROR
			);
			return;
		}

		// Resolve extension path
		const extensionPath = resolveExtensionPath(opts?.extension);
		if (!extensionPath) {
			tui.fatal(
				'Could not find the Agentuity Coder extension.\n\nEither:\n  - Install it: npm install @agentuity/coder\n  - Set AGENTUITY_CODER_EXTENSION environment variable\n  - Pass --extension flag',
				ErrorCode.CONFIG_INVALID
			);
			return;
		}

		// Resolve pi binary
		const piBinary = resolvePiBinary(opts?.pi);

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
					type SessionInfo = {
						id: string;
						label: string;
						status: string;
						task: string | null;
						createdAt: string;
					};

					const sessions = await tui.spinner({
						message: 'Fetching connectable sessions…',
						callback: async () => {
							const resp = await fetch(`${hubHttpUrl}/api/hub/sessions/connectable`, {
								headers: hubFetchHeaders(),
								signal: AbortSignal.timeout(10_000),
							});
							if (!resp.ok) {
								throw new Error(`${resp.status} ${resp.statusText}`);
							}
							const data = (await resp.json()) as { sessions: SessionInfo[] };
							return data.sessions;
						},
					});

					if (sessions.length === 0) {
						tui.fatal(
							'No connectable sandbox sessions found.\n\nCreate one with: ag-dev coder session create --task "your task"',
							ErrorCode.CONFIG_INVALID
						);
						return;
					}

					const prompt = tui.createPrompt();
					remoteSessionId = await prompt.select<string>({
						message: 'Select a sandbox session to connect to',
						options: sessions.map((s) => {
							const age = timeSince(new Date(s.createdAt));
							const taskPreview = s.task ? s.task.slice(0, 55) : null;
							const label = taskPreview
								? `${s.label} ${tui.muted(`(${s.status}, ${age})`)} — ${taskPreview}`
								: `${s.label} ${tui.muted(`(${s.status}, ${age})`)}`;
							return {
								value: s.id,
								label,
								hint: s.id,
							};
						}),
					});
				} catch (err) {
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
			if (!options.json) {
				tui.newline();
				tui.output(`  Hub:       ${tui.bold(hubWsUrl)}`);
				tui.output(`  Extension: ${tui.bold(extensionPath)}`);
				tui.output(`  Remote:    ${tui.bold(remoteSessionId)}`);
				tui.newline();
			}

			try {
				const { runRemoteTui } = await import(join(extensionPath, 'src', 'remote-tui.ts'));
				await runRemoteTui({
					hubWsUrl,
					sessionId: remoteSessionId,
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

			const hubHttpUrl = await resolveHubUrl(opts?.hubUrl);
			if (!hubHttpUrl) {
				tui.fatal('Could not find Hub URL for sandbox creation.', ErrorCode.NETWORK_ERROR);
				return;
			}

			// Build request body
			const body: Record<string, unknown> = { task };
			if (opts?.repo) {
				body.repo = { url: opts.repo };
			}

			// Create sandbox session via Hub API
			tui.newline();
			tui.output(`  Creating sandbox session...`);

			let sessionId: string;
			try {
				const resp = await fetch(`${hubHttpUrl}/api/hub/session`, {
					method: 'POST',
					headers: hubFetchHeaders({ 'Content-Type': 'application/json' }),
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(10_000),
				});
				if (!resp.ok) {
					const errText = await resp.text();
					tui.fatal(
						`Failed to create sandbox session: ${resp.status} ${errText}`,
						ErrorCode.NETWORK_ERROR
					);
					return;
				}
				const sessionInfo = (await resp.json()) as { sessionId: string };
				sessionId = sessionInfo.sessionId;
			} catch (err) {
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
					const pollResp = await fetch(`${hubHttpUrl}/api/hub/session/${sessionId}`, {
						headers: hubFetchHeaders(),
						signal: AbortSignal.timeout(5_000),
					});
					if (pollResp.ok) {
						const data = (await pollResp.json()) as {
							participants?: Array<{ role: string }>;
						};
						if (data.participants?.some((p) => p.role === 'lead')) {
							driverConnected = true;
							break;
						}
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
				const { runRemoteTui } = await import(join(extensionPath, 'src', 'remote-tui.ts'));
				await runRemoteTui({
					hubWsUrl,
					sessionId,
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
		// TODO: Remove/Change when we get Agentuity service level auth enabled, this is just temporary
		const cliApiKey = process.env.AGENTUITY_CODER_API_KEY;
		if (cliApiKey) env.AGENTUITY_CODER_API_KEY = cliApiKey;

		if (opts?.agent) {
			env.AGENTUITY_CODER_AGENT = opts.agent;
		}

		// Build pi command args
		const piArgs = ['-e', extensionPath];
		const piVersionInfo = inspectPiBinaryVersion(piBinary);

		if (!options.json) {
			tui.newline();
			tui.output(`  Hub:       ${tui.bold(hubWsUrl)}`);
			tui.output(`  Extension: ${tui.bold(extensionPath)}`);
			tui.output(`  Pi:        ${tui.bold(piBinary)}`);
			if (piVersionInfo?.version) {
				tui.output(`  Pi Ver:    ${tui.bold(piVersionInfo.version)}`);
			}
			if (opts?.agent) tui.output(`  Agent:     ${tui.bold(opts.agent)}`);
			tui.newline();
		}

		if (!options.json && piVersionInfo?.version && piVersionInfo.supported === false) {
			tui.warning(
				`Detected Pi ${piVersionInfo.version}. Agentuity Coder is currently tested with Pi ${SUPPORTED_PI_VERSION_RANGE}. Continuing anyway.`
			);
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
