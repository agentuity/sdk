import { z } from 'zod';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { getServiceUrls } from '@agentuity/server';
import { createCommand } from '../../types';
import { startBunDevServer } from '../build/vite/bun-dev-server';
import { startViteAssetServer } from '../build/vite/vite-asset-server';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { generateEndpoint, type DevmodeResponse } from './api';
import { APIClient, getAPIBaseURL, getAppBaseURL, getGravityDevModeURL } from '../../api';
import { download } from './download';
import { createDevmodeSyncService } from './sync';
import { getDevmodeDeploymentId } from '../build/ids';
import { getDefaultConfigDir, saveConfig, loadProjectSDKKey, getAuth } from '../../config';
import type { Config } from '../../types';
import { typecheck } from '../build/typecheck';
import { validateGravityRequiresUpgrade } from '../../runtime';
import { isTTY, hasLoggedInBefore } from '../../auth';

import { prepareDevLock, releaseLockSync } from './dev-lock';
import { checkAndUpgradeDependencies } from '../../utils/dependency-checker';
import { initProcessManager } from './process-manager';
import { detectVersionMismatch, formatVersionMismatchWarning } from '../../utils/version-mismatch';

import { ErrorCode } from '../../errors';

const DEFAULT_PORT = 3500;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

// Minimal interface for subprocess management
interface ProcessLike {
	kill: (signal?: number | NodeJS.Signals) => void;
	exitCode: number | null;
	pid?: number;
	stdout?: AsyncIterable<Uint8Array>;
	stderr?: AsyncIterable<Uint8Array>;
}

interface ServerLike {
	close: () => void | Promise<void>;
}

/**
 * Kill any lingering gravity processes from previous dev sessions.
 * This is a defensive measure to clean up orphaned processes.
 */
async function killLingeringGravityProcesses(logger: {
	debug: (msg: string, ...args: unknown[]) => void;
}): Promise<void> {
	// Only attempt on Unix-like systems (macOS, Linux)
	if (process.platform === 'win32') {
		return;
	}

	try {
		// Use pkill to kill gravity processes owned by current user
		// The -f flag matches against full command line
		// We specifically match the gravity binary name to avoid killing unrelated processes
		const result = Bun.spawnSync(['pkill', '-f', 'gravity.*--endpoint-id'], {
			stdout: 'ignore',
			stderr: 'ignore',
		});

		// Exit code 0 = processes killed, 1 = no matching processes, other = error
		if (result.exitCode === 0) {
			logger.debug('Killed lingering gravity processes from previous session');
			// Brief pause to let processes fully terminate
			await new Promise((resolve) => setTimeout(resolve, 100));
		} else if (result.exitCode === 1) {
			logger.debug('no lingering gravity processes found');
		}
	} catch {
		// pkill not available or failed - not critical, continue
	}
}

/**
 * Kill the Bun backend subprocess if one is running.
 */
function killBunSubprocess(logger: { debug: (msg: string, ...args: unknown[]) => void }): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const globalAny = globalThis as any;
	const bunSubprocess = globalAny.__AGENTUITY_BUN_SUBPROCESS__ as ProcessLike | undefined;
	if (!bunSubprocess) return;

	try {
		bunSubprocess.kill('SIGTERM');
		logger.debug('Bun subprocess killed');
	} catch (err) {
		logger.debug('Error killing Bun subprocess: %s', err);
	}
	globalAny.__AGENTUITY_BUN_SUBPROCESS__ = undefined;
}

const getDefaultPort = (): number => {
	const envPort = process.env.PORT;
	if (!envPort) {
		return DEFAULT_PORT;
	}
	const trimmed = envPort.trim();
	if (!trimmed || !/^\d+$/.test(trimmed)) {
		return DEFAULT_PORT;
	}
	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
		return DEFAULT_PORT;
	}
	return parsed;
};

const shouldDisableInteractive = (interactive?: boolean) => {
	if (!interactive) {
		return true;
	}
	return process.env.TERM_PROGRAM === 'vscode';
};

export const command = createCommand({
	name: 'dev',
	description: 'Build and run the development server',
	tags: ['mutating', 'slow', 'requires-project'],
	idempotent: true,
	examples: [
		{ command: getCommand('dev'), description: 'Start development server' },
		{ command: getCommand('dev --port 8080'), description: 'Specify custom port' },
		{ command: getCommand('dev --local'), description: 'Run in local mode' },
		{ command: getCommand('dev --no-public'), description: 'Disable public URL' },
	],
	schema: {
		options: z.object({
			local: z.boolean().optional().describe('Turn on local services (instead of cloud)'),
			interactive: z.boolean().default(true).optional().describe('Turn on interactive mode'),
			public: z
				.boolean()
				.optional()
				.default(!process.env.CI)
				.describe('Turn on or off the public url'),
			port: z
				.number()
				.min(MIN_PORT)
				.max(MAX_PORT)
				.default(getDefaultPort())
				.describe('The TCP port to start the dev server (also reads from PORT env)'),
			inspect: z.boolean().optional().describe('Enable bun debugger on available port'),
			inspectWait: z
				.boolean()
				.optional()
				.describe('Enable bun debugger and wait for connection before executing'),
			inspectBrk: z
				.boolean()
				.optional()
				.describe('Enable bun debugger with breakpoint at first line'),

			noTypecheck: z
				.boolean()
				.optional()
				.describe('Skip TypeScript type checking on startup and restarts'),

			resume: z.string().optional().describe('Resume a paused Hub session by ID'),
		}),
	},
	optional: { project: true },

	async handler(ctx) {
		const { opts, logger, projectDir } = ctx;
		let { config, project } = ctx;

		// Get auth state - we handle auth ourselves based on project state
		let auth = await getAuth();

		const rootDir = resolve(projectDir);
		const appTs = join(rootDir, 'app.ts');
		const srcDir = join(rootDir, 'src');

		// Verify required files exist
		const mustHaves = [join(rootDir, 'package.json'), appTs, srcDir];
		const missing: string[] = [];

		const interactive = !shouldDisableInteractive(opts.interactive);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let originalExit = (globalThis as any).AGENTUITY_PROCESS_EXIT;

		if (!originalExit) {
			originalExit = process.exit.bind(process);
		}

		for (const filename of mustHaves) {
			if (!existsSync(filename)) {
				missing.push(filename);
			}
		}

		if (missing.length) {
			tui.error(`${rootDir} does not appear to be a valid Agentuity project`);
			for (const filename of missing) {
				tui.bullet(`Missing ${filename}`);
			}
			originalExit(1);
		}

		// Handle authentication state based on project registration
		if (project) {
			// Registered project (has agentuity.json) - check if user needs to login
			const isValidAuth = auth && auth.expires > new Date();
			if (!isValidAuth) {
				if (isTTY()) {
					const hasProfile = await hasLoggedInBefore();
					const message = hasProfile
						? 'Your session has expired or you are not logged in.'
						: 'This project is registered with Agentuity Cloud but you are not logged in.';

					tui.warning(message);
					tui.newline();

					const shouldLogin = await tui.confirm(
						hasProfile
							? 'Would you like to login now?'
							: 'Would you like to login or create an account?',
						true
					);

					if (shouldLogin) {
						tui.newline();

						// Run login flow inline
						const { loginCommand } = await import('../auth/login');

						// Ensure apiClient is available for login handler
						const loginCtx = ctx as unknown as Record<string, unknown>;
						if (!loginCtx.apiClient) {
							loginCtx.apiClient = new APIClient(getAPIBaseURL(config), logger, config);
						}

						if (loginCommand.handler) {
							await loginCommand.handler(
								loginCtx as Parameters<NonNullable<typeof loginCommand.handler>>[0]
							);
						}

						// Refresh auth state after login
						const freshAuth = await getAuth();
						if (!freshAuth || freshAuth.expires <= new Date()) {
							tui.fatal('Login was not completed successfully.', ErrorCode.AUTH_FAILED);
						}
						auth = freshAuth;
						tui.newline();
						tui.success('Login successful! Continuing with dev server...');
						tui.newline();
					} else {
						// User chose not to login - show warning about disabled features
						tui.newline();
						tui.showLoggedOutMessage(getAppBaseURL(config), hasProfile);
					}
				} else {
					// Non-TTY: fatal error with instruction
					logger.fatal(
						`Authentication required for this project.\n` +
							`Run "${getCommand('auth login')}" to login to Agentuity`,
						ErrorCode.AUTH_REQUIRED
					);
				}
			}

			// After auth is established, verify project access
			if (auth && config) {
				const { reconcileProject } = await import('../project/reconcile');
				const apiClient = new APIClient(getAPIBaseURL(config), logger, auth.apiKey, config);

				const result = await reconcileProject({
					dir: rootDir,
					auth,
					apiClient,
					config,
					logger,
					interactive: isTTY(),
				});

				if (result.status === 'error') {
					tui.fatal(result.message!, ErrorCode.PROJECT_NOT_FOUND);
				} else if (result.status === 'imported' && result.project) {
					// Project was re-imported to user's org
					project = result.project;
					tui.newline();
				} else if (result.status === 'skipped') {
					// User declined import - can't continue with cloud features
					tui.warning('Continuing in local-only mode.');
					project = undefined;
				}
			}
		} else {
			// No agentuity.json - check if this is a valid project that needs importing
			if (auth && config) {
				const { reconcileProject } = await import('../project/reconcile');
				const apiClient = new APIClient(getAPIBaseURL(config), logger, auth.apiKey, config);

				const result = await reconcileProject({
					dir: rootDir,
					auth,
					apiClient,
					config,
					logger,
					interactive: isTTY(),
				});

				if (result.status === 'error') {
					// Not a valid project - show local-only warning
					tui.showLocalOnlyWarning();
				} else if (result.status === 'imported' && result.project) {
					// Project was imported - reload project config
					project = result.project;
					tui.newline();
				} else if (result.status === 'skipped') {
					// User declined import - continue in local-only mode
					tui.showLocalOnlyWarning();
				}
			} else {
				// Not authenticated - local-only mode
				tui.showLocalOnlyWarning();
			}
		}

		// Prepare dev lock: cleans up stale processes from previous sessions
		// and creates a new lockfile for this session
		const devLock = await prepareDevLock(rootDir, opts.port, logger);

		// Kill any lingering gravity processes from previous dev sessions
		// This is a fallback for cases where the lockfile was corrupted
		await killLingeringGravityProcesses(logger);

		// Check and upgrade @agentuity/* dependencies if needed
		const upgradeResult = await checkAndUpgradeDependencies(rootDir, logger);
		if (upgradeResult.failed.length > 0) {
			devLock.release();
			tui.fatal(
				`Failed to upgrade dependencies: ${upgradeResult.failed.join(', ')}`,
				ErrorCode.BUILD_FAILED
			);
		}

		// Check for version mismatches (v1 vs v2 SDK packages)
		const versionMismatch = detectVersionMismatch(rootDir, logger);
		if (versionMismatch.hasV1Packages || versionMismatch.hasMajorMismatches) {
			tui.newline();
			tui.warning(formatVersionMismatchWarning(versionMismatch));
			tui.newline();
		}

		try {
			// Setup devmode and gravity (if using public URL)
			const useMockService = process.env.DEVMODE_SYNC_SERVICE_MOCK === 'true';
			// Create apiClient with fresh auth API key (important after inline login)
			const apiClient = auth
				? new APIClient(getAPIBaseURL(config), logger, auth.apiKey, config)
				: null;
			const syncService = apiClient
				? createDevmodeSyncService({
						logger,
						apiClient,
						mock: useMockService,
					})
				: null;

			// Track previous metadata for sync diffing
			let previousMetadata:
				| Awaited<
						ReturnType<typeof import('../build/vite/metadata-generator').generateMetadata>
				  >
				| undefined;

			let devmode: DevmodeResponse | undefined;
			let gravityBin: string | undefined;
			let gravityURL: string | undefined;
			let appURL: string | undefined;
			let savedPrivateKey: string | undefined = config?.devmode?.privateKey
				? Buffer.from(config.devmode.privateKey, 'base64').toString('utf-8')
				: undefined;

			if (auth && project && opts.public) {
				// Generate devmode endpoint for public URL
				const endpoint = await tui.spinner({
					message: 'Connecting to Gravity',
					callback: () => {
						return generateEndpoint(
							apiClient!,
							project.projectId,
							config?.devmode?.hostname,
							savedPrivateKey
						);
					},
					clearOnSuccess: true,
				});

				if (endpoint.privateKey) {
					savedPrivateKey = endpoint.privateKey;
				}
				const _config = { ...config } as Config;
				_config.devmode = {
					hostname: endpoint.hostname,
					privateKey: savedPrivateKey
						? Buffer.from(savedPrivateKey).toString('base64')
						: undefined,
				};
				await saveConfig(_config);
				config = _config;
				devmode = endpoint;
				gravityURL = getGravityDevModeURL(project.region, config);
				appURL = `${getAppBaseURL(config)}/r/${project.projectId}`;

				// Download gravity client
				const configDir = getDefaultConfigDir();
				const gravityDir = join(configDir, 'gravity');
				let mustCheck = true;

				if (
					config?.gravity?.version &&
					existsSync(join(gravityDir, config.gravity.version, 'gravity')) &&
					config?.gravity?.checked &&
					!validateGravityRequiresUpgrade(config.gravity.version)
				) {
					if (Date.now() - config.gravity.checked < 3.6e6) {
						mustCheck = false;
						gravityBin = join(gravityDir, config.gravity.version, 'gravity');
					}
				}

				if (mustCheck) {
					const res = await download(gravityDir);
					gravityBin = res.filename;
					const _config = { ...config } as Config;
					_config.gravity = {
						checked: Date.now(),
						version: res.version,
					};
					await saveConfig(_config);
					config = _config;
				}
			}

			// Get workbench info from createApp() in app.ts (v2 approach)
			const { getWorkbenchConfig, loadRuntimeConfig } = await import(
				'../build/vite/config-loader'
			);
			const runtimeConfig = await loadRuntimeConfig(rootDir, logger);
			const workbenchConfigData = getWorkbenchConfig(true, runtimeConfig); // dev mode
			const workbench = {
				hasWorkbench: workbenchConfigData.enabled,
				config: workbenchConfigData.enabled
					? { route: workbenchConfigData.route, headers: workbenchConfigData.headers }
					: null,
			};

			const deploymentId = getDevmodeDeploymentId(project?.projectId ?? '', devmode?.id ?? '');

			// Calculate URLs for banner
			const padding = 12;
			const workbenchUrl =
				auth && project?.projectId
					? `${getAppBaseURL(config)}/w/${project.projectId}`
					: `http://127.0.0.1:${opts.port}${workbench.config?.route ?? '/workbench'}`;

			const devmodebody =
				tui.muted(tui.padRight('Local:', padding)) +
				tui.link(`http://127.0.0.1:${opts.port}`) +
				'\n' +
				tui.muted(tui.padRight('Public:', padding)) +
				(devmode?.hostname ? tui.link(`https://${devmode.hostname}`) : tui.warn('Disabled')) +
				'\n' +
				tui.muted(tui.padRight('Workbench:', padding)) +
				(workbench.hasWorkbench ? tui.link(workbenchUrl) : tui.warn('Disabled')) +
				'\n' +
				tui.muted(tui.padRight('Dashboard:', padding)) +
				(appURL ? tui.link(appURL) : tui.warn('Disabled')) +
				'\n' +
				(interactive
					? '\n' + tui.muted('Press ') + tui.bold('h') + tui.muted(' for keyboard shortcuts')
					: '');

			tui.banner('⨺ Agentuity DevMode', devmodebody, {
				padding: 2,
				topSpacer: false,
				bottomSpacer: false,
				centerTitle: false,
			});

			// Detect user route mount paths for Vite proxy configuration
			// This is a quick AST scan of app.ts — runs before Vite starts
			let routePaths: string[] = ['/api']; // Default fallback
			try {
				const { detectExplicitRouter } = await import('../build/app-router-detector');
				const detection = await detectExplicitRouter(rootDir, logger);
				if (detection.detected && detection.mounts.length > 0) {
					routePaths = detection.mounts.map((m) => m.path);
					logger.debug('Detected route mount paths: %s', routePaths.join(', '));
				}
			} catch (err) {
				logger.debug('Route detection failed, using default /api: %s', err);
			}

			// Pick internal ports (neither is user-facing — the front-door proxy is)
			const bunBackendPort = opts.port + 1;
			const viteInternalPort = opts.port + 2;

			// No-bundle dev mode guard: ensure stale bundled app artifact cannot be executed.
			// We keep other .agentuity artifacts (metadata/workbench files) intact.
			try {
				const staleBundlePath = join(rootDir, '.agentuity', 'app.js');
				if (existsSync(staleBundlePath)) {
					await Bun.file(staleBundlePath).delete();
					logger.debug('Removed stale dev bundle artifact: %s', staleBundlePath);
				}
			} catch (err) {
				logger.debug('Failed to remove stale dev bundle artifact: %s', err);
			}

			// Debug trace: locate unexpected legacy credential warnings.
			// Enable with AGENTUITY_TRACE_CREDENTIAL_WARNINGS=true.
			if (process.env.AGENTUITY_TRACE_CREDENTIAL_WARNINGS === 'true') {
				const originalConsoleError = console.error.bind(console);
				console.error = (...args: unknown[]) => {
					try {
						const first = typeof args[0] === 'string' ? args[0] : '';
						if (first.includes('No credentials found for this AI provider')) {
							const stack = new Error('Credential warning trace').stack;
							originalConsoleError('[TRACE] Credential warning origin stack:');
							if (stack) originalConsoleError(stack);
						}
					} catch {
						// ignore tracing errors
					}
					originalConsoleError(...args);
				};
			}

			// Start Vite dev server on an internal port.
			// The user-facing port is handled by the front-door TCP proxy (ws-proxy)
			// which routes WS upgrades to Bun and everything else to Vite.
			let viteServer: ServerLike | null = null;
			let vitePort: number;

			// Initialize process manager to track all servers/processes
			const procManager = initProcessManager(logger);

			try {
				logger.debug('Starting Vite dev server (internal port %d)...', viteInternalPort);
				const viteResult = await startViteAssetServer({
					rootDir,
					logger,
					workbenchPath: workbench.config?.route,
					port: viteInternalPort,
					backendPort: bunBackendPort,
					routePaths,
					liveHostname: devmode?.hostname,
				});
				viteServer = viteResult.server;
				vitePort = viteResult.port;

				// Register Vite server with process manager
				procManager.registerServer({
					id: 'vite',
					server: viteServer,
					description: 'Vite dev server (frontend assets)',
					port: vitePort,
				});

				// Update dev lock with actual Vite port
				await devLock.updatePorts({ vite: vitePort });

				logger.debug(
					`Vite dev server running on port ${vitePort} (internal, proxying backend on port ${bunBackendPort})`
				);
			} catch (error) {
				tui.error(`Failed to start Vite dev server: ${error}`);
				await procManager.cleanup('vite startup failure');
				await devLock.release();
				originalExit(1);
				return;
			}

			// Start the front-door TCP proxy on the user-facing port.
			// Routes WebSocket upgrades (for /api/*, /_agentuity/*) directly to Bun
			// and everything else (HTTP, HMR WebSocket) to Vite.
			// This works around Bun's broken node:http upgrade socket implementation.
			let frontDoorServer: import('node:net').Server | null = null;
			try {
				const { startWsProxy } = await import('../build/vite/ws-proxy');
				frontDoorServer = await startWsProxy({
					port: opts.port,
					vitePort,
					backendPort: bunBackendPort,
					routePaths,
					logger,
				});

				// Register front-door proxy with process manager
				procManager.registerServer({
					id: 'front-door-proxy',
					server: {
						close: () => {
							frontDoorServer?.close();
						},
					},
					description: 'Front-door TCP proxy (WS routing)',
					port: opts.port,
				});

				logger.debug(
					`Front-door proxy on port ${opts.port} (Vite:${vitePort}, Bun:${bunBackendPort})`
				);
			} catch (error) {
				tui.error(`Failed to start front-door proxy: ${error}`);
				await procManager.cleanup('front-door proxy startup failure');
				await devLock.release();
				originalExit(1);
				return;
			}

			// --- State for long-running processes ---
			let gravityProcess: ProcessLike | null = null;
			let gravityHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
			let stdinListenerRegistered = false;
			let stdinDataHandler: ((data: Buffer | string) => void) | null = null;
			let shutdownRequested = false;

			/**
			 * Centralized cleanup function for all resources.
			 * Uses the process manager for tracked servers/processes.
			 */
			const cleanup = async (exitAfter = false, exitCode = 0, silent = false) => {
				if (shutdownRequested) return;
				shutdownRequested = true;

				if (!silent) {
					tui.info('Shutting down...');
				}

				// Stop gravity heartbeat interval first
				if (gravityHeartbeatInterval) {
					clearInterval(gravityHeartbeatInterval);
					gravityHeartbeatInterval = null;
				}

				// Use process manager for tracked cleanup
				await procManager.cleanup('shutdown');

				// Additional cleanup for non-tracked resources
				await devLock.release();
				await killLingeringGravityProcesses(logger);

				if (exitAfter) {
					if (stdinListenerRegistered && process.stdin.isTTY) {
						try {
							if (stdinDataHandler) {
								process.stdin.removeListener('data', stdinDataHandler);
								stdinDataHandler = null;
							}
							process.stdin.setRawMode(false);
							process.stdin.pause();
							process.stdin.unref();
						} catch {
							// Ignore
						}
					}
					originalExit(exitCode);
				}
			};

			// Signal handlers
			let exitingFromSignal = false;
			const safeExit = (code: number, reason?: string) => {
				if (exitingFromSignal) return;
				exitingFromSignal = true;
				if (reason) logger.debug('DevMode terminating (%d): %s', code, reason);
				shutdownRequested = true;
				cleanup(true, code).catch(() => originalExit(1));
			};

			process.on('SIGINT', () => safeExit(0, 'SIGINT'));
			process.on('SIGTERM', () => safeExit(0, 'SIGTERM'));
			process.on('SIGHUP', () => safeExit(0, 'SIGHUP'));
			process.on('uncaughtException', (err) => {
				tui.error(
					`Uncaught exception: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
				);
				void safeExit(1, 'uncaughtException');
			});
			process.on('unhandledRejection', (reason) => {
				logger.warn(
					'Unhandled promise rejection: %s',
					reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
				);
			});
			process.on('exit', () => {
				if (gravityProcess?.exitCode === null) {
					try {
						gravityProcess.kill('SIGKILL');
					} catch {
						// Ignore
					}
				}
				if (viteServer) {
					try {
						viteServer.close();
					} catch {
						// Ignore
					}
				}
				killBunSubprocess(logger);
				releaseLockSync(rootDir);
			});

			// ================================================================
			// Step 0b: Early environment setup
			// ================================================================
			// Load SDK key and set gateway env vars BEFORE agent discovery.
			// Agent discovery imports eval files, which may import LLM SDKs at
			// module scope. Those SDKs check for API keys (e.g. GROQ_API_KEY)
			// at import time, so the gateway env patching must happen first.

			if (!process.env.AGENTUITY_SDK_KEY) {
				const sdkKey = await loadProjectSDKKey(logger, rootDir);
				if (sdkKey) {
					process.env.AGENTUITY_SDK_KEY = sdkKey;
				} else if (project) {
					tui.warning(
						'AGENTUITY_SDK_KEY not found in .env file. Numerous features will be unavailable.'
					);
					tui.bullet(
						`Run "${getCommand('cloud env pull')}" to sync your SDK key, or add AGENTUITY_SDK_KEY to your .env file.`
					);
				}
			}

			process.env.NODE_ENV = 'development';
			process.env.AGENTUITY_ENV = 'development';

			if (project) {
				const earlyServiceUrls = getServiceUrls(project.region);
				if (!process.env.AGENTUITY_TRANSPORT_URL) {
					process.env.AGENTUITY_TRANSPORT_URL = earlyServiceUrls.catalyst;
				}
			}

			// Apply gateway env patching so LLM SDK API keys are set before
			// agent discovery imports eval files that may reference them.
			{
				const sdkKey = process.env.AGENTUITY_SDK_KEY;
				const gatewayUrl =
					process.env.AGENTUITY_AIGATEWAY_URL ||
					process.env.AGENTUITY_TRANSPORT_URL ||
					(sdkKey ? 'https://catalyst.agentuity.cloud' : '');

				const gatewayConfigs = [
					{
						apiKeyEnv: 'ANTHROPIC_API_KEY',
						baseUrlEnv: 'ANTHROPIC_BASE_URL',
						provider: 'anthropic',
					},
					{ apiKeyEnv: 'GROQ_API_KEY', baseUrlEnv: 'GROQ_BASE_URL', provider: 'groq' },
					{ apiKeyEnv: 'OPENAI_API_KEY', baseUrlEnv: 'OPENAI_BASE_URL', provider: 'openai' },
				];

				for (const cfg of gatewayConfigs) {
					const currentKey = process.env[cfg.apiKeyEnv];
					if (currentKey && currentKey !== sdkKey) continue;
					if (gatewayUrl && sdkKey) {
						process.env[cfg.apiKeyEnv] = sdkKey;
						process.env[cfg.baseUrlEnv] = `${gatewayUrl}/gateway/${cfg.provider}`;
						logger.debug('Enabled Agentuity AI Gateway for %s', cfg.provider);
					}
				}
			}

			// ================================================================
			// Step 1: Prepare dev server (once)
			// ================================================================

			await tui.spinner({
				message: 'Preparing dev server',
				callback: async () => {
					// Typecheck (skip with --no-typecheck)
					if (!opts.noTypecheck) {
						const typeResult = await typecheck(rootDir);
						if (!typeResult.success) {
							// Non-fatal in dev: log errors and continue
							console.log('');
							console.log(typeResult.output);
							console.log('');
						}
					}

					// Generate workbench files if enabled
					if (workbenchConfigData.enabled) {
						const { generateWorkbenchFiles } = await import(
							'../build/vite/workbench-generator'
						);
						await generateWorkbenchFiles(
							rootDir,
							project?.projectId ?? '',
							workbenchConfigData,
							logger
						);
					}

					// Discover agents and routes in parallel
					const srcDir = join(rootDir, 'src');
					const { discoverAgents } = await import('../build/vite/agent-discovery');
					const { discoverRoutes } = await import('../build/vite/route-discovery');

					const [agentMetadata, { routes }] = await Promise.all([
						discoverAgents(srcDir, project?.projectId ?? '', deploymentId, logger),
						discoverRoutes(srcDir, project?.projectId ?? '', deploymentId, logger),
					]);

					// Generate metadata file
					const { generateMetadata, writeMetadataFile } = await import(
						'../build/vite/metadata-generator'
					);

					const promises: Promise<void>[] = [];

					// Generate prompt files (non-blocking)
					promises.push(
						import('../build/vite/prompt-generator')
							.then(({ generatePromptFiles }) => generatePromptFiles(srcDir, logger))
							.catch((err) =>
								logger.warn('Failed to generate prompt files: %s', err.message)
							)
					);

					const metadata = await generateMetadata({
						rootDir,
						projectId: project?.projectId ?? '',
						orgId: project?.orgId ?? '',
						deploymentId,
						agents: agentMetadata,
						routes,
						dev: true,
						logger,
					});

					writeMetadataFile(rootDir, metadata, true, logger);

					// Sync metadata with backend
					if (syncService && project?.projectId) {
						promises.push(
							syncService.sync(metadata, previousMetadata, project.projectId, deploymentId)
						);
						previousMetadata = metadata;
					}
					await Promise.all(promises);
				},
				clearOnSuccess: true,
			});

			// ================================================================
			// Step 2: Set remaining environment variables
			// ================================================================
			// Note: AGENTUITY_SDK_KEY, NODE_ENV, AGENTUITY_ENV, and
			// AGENTUITY_TRANSPORT_URL are already set in Step 0b (before
			// agent discovery) to support gateway env patching.

			process.env.AGENTUITY_SDK_DEV_MODE = 'true';
			process.env.AGENTUITY_RUNTIME = 'yes';
			process.env.AGENTUITY_PROJECT_DIR = rootDir;
			if (project?.region) {
				process.env.AGENTUITY_REGION = project.region;
			}
			process.env.PORT = String(bunBackendPort);
			process.env.AGENTUITY_PORT = String(bunBackendPort);
			process.env.AGENTUITY_BASE_URL =
				process.env.AGENTUITY_BASE_URL || `http://localhost:${vitePort}`;
			process.env.AGENTUITY_NO_BUNDLE = 'true';

			if (opts.resume) {
				process.env.AGENTUITY_CODER_RESUME_SESSION = opts.resume;
			}

			if (project) {
				const serviceUrls = getServiceUrls(project.region);
				process.env.AGENTUITY_TRANSPORT_URL = serviceUrls.catalyst;
				process.env.AGENTUITY_CATALYST_URL = serviceUrls.catalyst;
				process.env.AGENTUITY_VECTOR_URL = serviceUrls.vector;
				process.env.AGENTUITY_KEYVALUE_URL = serviceUrls.keyvalue;
				process.env.AGENTUITY_SANDBOX_URL = serviceUrls.sandbox;
				process.env.AGENTUITY_STREAM_URL = serviceUrls.stream;
				process.env.AGENTUITY_CLOUD_ORG_ID = project.orgId;
				process.env.AGENTUITY_CLOUD_PROJECT_ID = project.projectId;
				process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID = deploymentId;
			}

			if (devmode?.hostname) {
				process.env.AGENTUITY_DEVMODE_URL = `https://${devmode.hostname}`;
			} else {
				process.env.AGENTUITY_DEVMODE_URL = `http://localhost:${vitePort}`;
			}

			// ================================================================
			// Step 3: Start Bun backend with --hot (handles its own HMR)
			// ================================================================

			try {
				await startBunDevServer({
					rootDir,
					port: bunBackendPort,
					logger,
					vitePort,
					inspect: opts.inspect,
					inspectWait: opts.inspectWait,
					inspectBrk: opts.inspectBrk,
				});

				// Register Bun subprocess with process manager
				// The subprocess is stored in globalThis.__AGENTUITY_BUN_SUBPROCESS__
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const bunSubprocess = (globalThis as any).__AGENTUITY_BUN_SUBPROCESS__ as ProcessLike;
				if (bunSubprocess) {
					procManager.registerProcess({
						id: 'bun-backend',
						process: bunSubprocess,
						description: 'Bun backend server (--hot)',
						port: bunBackendPort,
						critical: true,
					});
				}
			} catch (error) {
				tui.error(`Failed to start Bun backend server: ${error}`);
				await cleanup(true, 1, true);
				return;
			}

			// ================================================================
			// Step 4: Start gravity tunnel (if public URL enabled)
			// ================================================================

			if (gravityBin && gravityURL && devmode && project) {
				const privateKeyPEM = devmode.privateKey ?? savedPrivateKey;
				if (!privateKeyPEM) {
					tui.error(
						'No private key available for gravity connection. Please re-run to generate a new key.'
					);
					await cleanup(true, 1, true);
					return;
				}

				try {
					gravityProcess = Bun.spawn(
						[
							gravityBin,
							'--endpoint-id',
							devmode.id,
							'--port',
							vitePort.toString(),
							'--url',
							gravityURL,
							'--log-level',
							process.env.AGENTUITY_GRAVITY_LOG_LEVEL ?? 'error',
							'--org-id',
							project.orgId,
							'--project-id',
							project.projectId,
							'--private-key',
							Buffer.from(privateKeyPEM).toString('base64'),
							'--health-check',
						],
						{
							cwd: rootDir,
							stdout: 'pipe',
							stderr: 'pipe',
							detached: false,
						}
					);

					const gravityPid = (gravityProcess as { pid?: number }).pid;
					if (gravityPid) {
						await devLock.registerChild({
							pid: gravityPid,
							type: 'gravity',
							description: 'Gravity public URL tunnel',
						});

						// Register with process manager
						procManager.registerProcess({
							id: 'gravity',
							process: gravityProcess,
							description: 'Gravity public URL tunnel',
							critical: false,
						});
					}

					// Log gravity output and detect heartbeat port
					(async () => {
						try {
							if (gravityProcess?.stdout) {
								for await (const chunk of gravityProcess.stdout) {
									const text = new TextDecoder().decode(chunk);
									const trimmed = text.trim();

									const match = trimmed.match(/^HEARTBEAT_PORT=(\d+)$/m);
									if (match?.[1]) {
										const heartbeatPort = parseInt(match[1], 10);
										logger.debug('Gravity heartbeat port: %d', heartbeatPort);

										if (!gravityHeartbeatInterval) {
											const sendHeartbeat = async () => {
												try {
													await fetch(`http://127.0.0.1:${heartbeatPort}/heartbeat`, {
														method: 'POST',
														signal: AbortSignal.timeout(2000),
													});
												} catch {
													// Ignore heartbeat failures
												}
											};
											sendHeartbeat();
											gravityHeartbeatInterval = setInterval(sendHeartbeat, 5000);
										}
									} else if (trimmed) {
										logger.debug('[gravity] %s', trimmed);
									}
								}
							}
						} catch (err) {
							logger.error('Error reading gravity stdout: %s', err);
						}
					})();

					(async () => {
						try {
							if (gravityProcess?.stderr) {
								for await (const chunk of gravityProcess.stderr) {
									logger.warn('[gravity] %s', new TextDecoder().decode(chunk).trim());
								}
							}
						} catch (err) {
							logger.error('Error reading gravity stderr: %s', err);
						}
					})();
				} catch (error) {
					tui.error(`Failed to start gravity tunnel: ${error}`);
					await cleanup(true, 1, true);
					return;
				}
			}

			// ================================================================
			// Step 5: Keyboard shortcuts + wait for shutdown
			// ================================================================

			if (interactive && process.stdin.isTTY && process.stdout.isTTY) {
				stdinListenerRegistered = true;
				process.stdin.setRawMode(true);
				process.stdin.resume();
				process.stdin.setEncoding('utf8');

				const showHelp = () => {
					console.log('\n' + tui.bold('Keyboard Shortcuts:'));
					console.log(tui.muted('  h') + ' - show this help');
					console.log(tui.muted('  c') + ' - clear console');
					console.log(tui.muted('  q') + ' - quit\n');
				};

				stdinDataHandler = (data) => {
					const key = data.toString();
					if (key === '\u0003' || key === 'q') {
						if (stdinDataHandler) {
							process.stdin.removeListener('data', stdinDataHandler);
							stdinDataHandler = null;
						}
						shutdownRequested = true;
						cleanup(true, 0).catch(() => originalExit(1));
						return;
					}
					switch (key) {
						case 'h':
							showHelp();
							break;
						case 'c':
							console.clear();
							tui.banner('⨺ Agentuity DevMode', devmodebody, {
								padding: 2,
								topSpacer: false,
								bottomSpacer: false,
								centerTitle: false,
							});
							break;
						default:
							process.stdout.write(data);
							break;
					}
				};
				process.stdin.on('data', stdinDataHandler);
			}

			logger.info('DevMode ready 🚀');

			// Block until shutdown — bun --hot handles backend HMR,
			// Vite handles frontend HMR. Nothing to restart.
			await new Promise<void>((resolve) => {
				const check = setInterval(() => {
					if (shutdownRequested) {
						clearInterval(check);
						resolve();
					}
				}, 200);
			});
		} finally {
			/* brute force clean up */
			await devLock.release();
			await killLingeringGravityProcesses(logger);
			releaseLockSync(rootDir);
		}
	},
});
