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
import { createFileWatcher } from './file-watcher';
import { prepareDevLock, releaseLockSync } from './dev-lock';
import { checkAndUpgradeDependencies } from '../../utils/dependency-checker';

import { ErrorCode } from '../../errors';

const DEFAULT_PORT = 3500;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

// Minimal interface for subprocess management
interface ProcessLike {
	kill: (signal?: number | NodeJS.Signals) => void;
	exitCode: number | null;
	stdout?: AsyncIterable<Uint8Array>;
	stderr?: AsyncIterable<Uint8Array>;
}

interface ServerLike {
	close: () => void;
}

interface BunServer {
	stop: (closeActiveConnections?: boolean) => void;
	port: number;
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
 * Stop the existing Bun server if one is running.
 * Waits for the port to become available before returning (with timeout).
 * Handles both in-process server and subprocess (when debugger is enabled).
 */
async function stopBunServer(
	port: number,
	logger: { debug: (msg: string, ...args: unknown[]) => void }
): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const globalAny = globalThis as any;

	// Check for subprocess first (used when debugger flags are enabled)
	const bunSubprocess = globalAny.__AGENTUITY_BUN_SUBPROCESS__ as ProcessLike | undefined;
	if (bunSubprocess) {
		logger.debug('Stopping Bun subprocess...');
		try {
			bunSubprocess.kill('SIGTERM');
			// After SIGTERM, wait and check multiple times before giving up
			let attempts = 0;
			while (bunSubprocess.exitCode === null && attempts < 3) {
				await new Promise((resolve) => setTimeout(resolve, 100));
				attempts++;
			}
			if (bunSubprocess.exitCode === null) {
				bunSubprocess.kill('SIGKILL');
			}
			logger.debug('Bun subprocess killed');
		} catch (err) {
			logger.debug('Error killing Bun subprocess: %s', err);
		}
		globalAny.__AGENTUITY_BUN_SUBPROCESS__ = undefined;

		// Wait for port to become available
		const MAX_WAIT_ITERATIONS = 10;
		for (let i = 0; i < MAX_WAIT_ITERATIONS; i++) {
			try {
				await fetch(`http://127.0.0.1:${port}/`, {
					method: 'HEAD',
					signal: AbortSignal.timeout(150),
				});
				// Still responding, wait a bit more
				await new Promise((r) => setTimeout(r, 50));
			} catch {
				// Connection refused or timeout => server is down
				logger.debug('Bun subprocess stopped');
				break;
			}
		}
		return;
	}

	// Handle in-process server
	const server = globalAny.__AGENTUITY_SERVER__ as BunServer | undefined;
	if (!server) {
		logger.debug('No Bun server to stop');
		return;
	}

	try {
		logger.debug('Stopping Bun server...');
		server.stop(true); // Close active connections immediately
		logger.debug('Bun server stop() called');
	} catch (err) {
		logger.debug('Error stopping Bun server: %s', err);
	}

	// Wait for socket to close (max 2 seconds to avoid hanging on shutdown)
	const MAX_WAIT_ITERATIONS = 10;
	for (let i = 0; i < MAX_WAIT_ITERATIONS; i++) {
		try {
			await fetch(`http://127.0.0.1:${port}/`, {
				method: 'HEAD',
				signal: AbortSignal.timeout(150),
			});
			// Still responding, wait a bit more
			await new Promise((r) => setTimeout(r, 50));
		} catch {
			// Connection refused or timeout => server is down
			logger.debug('Bun server stopped');
			break;
		}
	}

	globalAny.__AGENTUITY_SERVER__ = undefined;
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

			// Get workbench info from config (new Vite approach)
			const { loadAgentuityConfig, getWorkbenchConfig } = await import(
				'../build/vite/config-loader'
			);
			const agentuityConfig = await loadAgentuityConfig(rootDir, ctx.logger);
			const workbenchConfigData = getWorkbenchConfig(agentuityConfig, true); // dev mode
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

			try {
				logger.debug('Starting Vite dev server (internal port %d)...', viteInternalPort);
				const viteResult = await startViteAssetServer({
					rootDir,
					logger,
					workbenchPath: workbench.config?.route,
					port: viteInternalPort,
					backendPort: bunBackendPort,
					routePaths,
				});
				viteServer = viteResult.server;
				vitePort = viteResult.port;

				// Update dev lock with actual Vite port
				await devLock.updatePorts({ vite: vitePort });

				logger.debug(
					`Vite dev server running on port ${vitePort} (internal, proxying backend on port ${bunBackendPort})`
				);
			} catch (error) {
				tui.error(`Failed to start Vite dev server: ${error}`);
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
				logger.debug(
					`Front-door proxy on port ${opts.port} (Vite:${vitePort}, Bun:${bunBackendPort})`
				);
			} catch (error) {
				tui.error(`Failed to start front-door proxy: ${error}`);
				await devLock.release();
				originalExit(1);
				return;
			}

			// Restart loop - allows BACKEND server to restart on file changes
			// Vite stays running and handles frontend changes via HMR
			let shouldRestart = false;
			let gravityProcess: ProcessLike | null = null;
			let gravityHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
			let stdinListenerRegistered = false; // Track if stdin listener is already registered

			const restartServer = () => {
				shouldRestart = true;
			};

			const showWelcome = () => {
				logger.info('DevMode ready 🚀');
			};

			// Create file watcher for backend hot reload
			const fileWatcher = createFileWatcher({
				rootDir,
				logger,
				onRestart: restartServer,
			});

			// Start file watcher (will be paused during builds)
			fileWatcher.start();

			// Track if cleanup is in progress to avoid duplicate cleanup
			let cleaningUp = false;
			// Track if shutdown was requested (SIGINT/SIGTERM) to break the main loop
			let shutdownRequested = false;
			// Store stdin data handler reference for cleanup
			let stdinDataHandler: ((data: Buffer | string) => void) | null = null;

			/**
			 * Centralized cleanup function for all resources.
			 * Called on restart, shutdown, and fatal errors.
			 * @param exitAfter - If true, exit the process after cleanup
			 * @param exitCode - Exit code to use if exitAfter is true
			 * @param silent - If true, don't show "Shutting down" message
			 */
			const cleanup = async (exitAfter = false, exitCode = 0, silent = false) => {
				if (cleaningUp) return;
				cleaningUp = true;

				if (!silent) {
					tui.info('Shutting down...');
				}

				// Stop file watcher first to prevent restart triggers during cleanup
				try {
					fileWatcher.stop();
				} catch (err) {
					logger.debug('Error stopping file watcher: %s', err);
				}

				// Stop front-door proxy
				try {
					frontDoorServer?.close();
				} catch (err) {
					logger.debug('Error stopping front-door proxy during cleanup: %s', err);
				}

				// Stop Bun server
				try {
					await stopBunServer(bunBackendPort, logger);
				} catch (err) {
					logger.debug('Error stopping Bun server during cleanup: %s', err);
				}

				// Stop gravity heartbeat interval
				if (gravityHeartbeatInterval) {
					clearInterval(gravityHeartbeatInterval);
					gravityHeartbeatInterval = null;
				}

				// Kill gravity client with SIGTERM first, then SIGKILL as fallback
				if (gravityProcess) {
					logger.debug('Killing gravity process...');
					try {
						gravityProcess.kill('SIGTERM');
						// Give it a moment to gracefully shutdown
						await new Promise((resolve) => setTimeout(resolve, 150));
						if (gravityProcess.exitCode === null) {
							gravityProcess.kill('SIGKILL');
						}
						logger.debug('Gravity process killed');
					} catch (err) {
						logger.debug('Error killing gravity process: %s', err);
					} finally {
						gravityProcess = null;
					}
				}

				// Close Vite asset server with timeout to prevent hanging
				if (viteServer) {
					logger.debug('Closing Vite server...');
					try {
						// Use Promise.race with timeout to prevent hanging
						const closePromise = viteServer.close();
						const timeoutPromise = new Promise<void>((resolve) => {
							setTimeout(() => {
								logger.debug('Vite server close timed out, continuing...');
								resolve();
							}, 2000);
						});
						await Promise.race([closePromise, timeoutPromise]);
						logger.debug('Vite server closed');
					} catch (err) {
						logger.debug('Error closing Vite server: %s', err);
					} finally {
						viteServer = null;
					}
				}

				// Release the dev lockfile
				logger.debug('Releasing dev lock...');
				try {
					await devLock.release();
					logger.debug('Dev lock released');
				} catch (err) {
					logger.debug('Error releasing dev lock: %s', err);
				}

				await killLingeringGravityProcesses(logger);

				// Reset cleanup flag if not exiting (allows restart)
				if (!exitAfter) {
					cleaningUp = false;
				} else {
					// Clean up stdin keyboard handler right before exiting
					// This must happen AFTER all async cleanup to keep event loop alive
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
							// Ignore errors during final cleanup
						}
					}
					logger.debug('Exiting with code %d', exitCode);
					originalExit(exitCode);
				}
			};

			/**
			 * Cleanup for restart: stops Bun server and Gravity, keeps Vite running
			 */
			const cleanupForRestart = async () => {
				logger.debug('Cleaning up for restart...');

				// Stop Bun server
				try {
					await stopBunServer(bunBackendPort, logger);
				} catch (err) {
					logger.debug('Error stopping Bun server for restart: %s', err);
				}

				// Stop gravity heartbeat interval
				if (gravityHeartbeatInterval) {
					clearInterval(gravityHeartbeatInterval);
					gravityHeartbeatInterval = null;
				}

				// Kill gravity client
				if (gravityProcess) {
					try {
						gravityProcess.kill('SIGTERM');
						await new Promise((resolve) => setTimeout(resolve, 150));
						if (gravityProcess.exitCode === null) {
							gravityProcess.kill('SIGKILL');
						}
					} catch (err) {
						logger.debug('Error killing gravity process for restart: %s', err);
					} finally {
						gravityProcess = null;
					}
				}
			};

			// SIGINT/SIGTERM: coordinate shutdown between bundle and dev resources
			let signalHandlersRegistered = false;
			let exitingFromSignal = false;
			if (!signalHandlersRegistered) {
				signalHandlersRegistered = true;

				const safeExit = (code: number, reason?: string) => {
					// Prevent multiple signal handlers from racing
					if (exitingFromSignal) return;
					exitingFromSignal = true;

					if (reason) {
						logger.debug('DevMode terminating (%d) due to: %s', code, reason);
					}
					shutdownRequested = true;
					// Run cleanup and ensure we wait for it to complete before exiting
					cleanup(true, code).catch((err) => {
						logger.debug('Cleanup error: %s', err);
						originalExit(1);
					});
				};

				process.on('SIGINT', () => {
					safeExit(0, 'SIGINT');
				});

				process.on('SIGTERM', () => {
					safeExit(0, 'SIGTERM');
				});

				// Handle SIGHUP (terminal closed) - same as SIGINT
				process.on('SIGHUP', () => {
					safeExit(0, 'SIGHUP');
				});

				// Handle uncaught exceptions - clean up and exit rather than limping on
				process.on('uncaughtException', (err) => {
					tui.error(
						`Uncaught exception: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
					);
					void safeExit(1, 'uncaughtException');
				});

				// Handle unhandled rejections - log but don't exit (usually recoverable)
				process.on('unhandledRejection', (reason) => {
					logger.warn(
						'Unhandled promise rejection: %s',
						reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
					);
				});
			}

			// Ensure resources are always cleaned up on exit (synchronous fallback)
			process.on('exit', () => {
				// Clean up stdin keyboard handler
				if (stdinListenerRegistered && process.stdin.isTTY) {
					try {
						if (stdinDataHandler) {
							process.stdin.removeListener('data', stdinDataHandler);
						}
						process.stdin.setRawMode(false);
						process.stdin.pause();
						process.stdin.unref();
					} catch {
						// Ignore errors during exit cleanup
					}
				}

				// Kill gravity client with SIGKILL for immediate termination
				if (gravityProcess && gravityProcess.exitCode === null) {
					try {
						gravityProcess.kill('SIGKILL');
					} catch {
						// Ignore errors during exit cleanup
					}
				}

				// Close Vite server synchronously if possible
				if (viteServer) {
					try {
						viteServer.close();
					} catch {
						// Ignore errors during exit cleanup
					}
				}

				// Stop Bun server synchronously (best effort)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const server = (globalThis as any).__AGENTUITY_SERVER__;
				if (server?.stop) {
					try {
						server.stop(true);
					} catch {
						// Ignore errors during exit cleanup
					}
				}

				// Release the dev lockfile synchronously
				releaseLockSync(rootDir);
			});

			while (!shutdownRequested) {
				shouldRestart = false;

				// Pause file watcher during build to avoid loops
				fileWatcher.pause();

				try {
					let typeCheckErrors: string | undefined;

					// Generate entry file and bundle for dev server (with LLM patches)
					await tui.spinner({
						message: 'Preparing dev server',
						callback: async () => {
							// Step 0: typecheck (skip with --no-typecheck)
							typeCheckErrors = undefined;

							if (!opts.noTypecheck) {
								const typeResult = await typecheck(rootDir);
								if (!typeResult.success) {
									typeCheckErrors = typeResult.output;
									return;
								}
							}

							// Step 1: Generate workbench files if enabled (must be done before entry generation)
							if (workbenchConfigData.enabled) {
								logger.debug('Workbench enabled, generating source files before bundle...');
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

							// Step 2: Discover agents and routes in parallel
							const srcDir = join(rootDir, 'src');
							const { discoverAgents } = await import('../build/vite/agent-discovery');
							const { discoverRoutes } = await import('../build/vite/route-discovery');

							const [agentMetadata, { routes }] = await Promise.all([
								discoverAgents(srcDir, project?.projectId ?? '', deploymentId, logger),
								discoverRoutes(srcDir, project?.projectId ?? '', deploymentId, logger),
							]);

							// Step 4: No bundling in dev mode (default no-bundle architecture)
							logger.debug('Skipping Bun.build in dev mode (no-bundle default)');

							// Generate metadata file (needed for eval ID lookup at runtime)
							// Reuse agentMetadata and routes from Step 2
							const { generateMetadata, writeMetadataFile } = await import(
								'../build/vite/metadata-generator'
							);

							const promises: Promise<void>[] = [];

							// Generate/update prompt files (non-blocking)
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

							// Sync metadata with backend (creates agents and evals in the database)
							if (syncService && project?.projectId) {
								promises.push(
									syncService.sync(
										metadata,
										previousMetadata,
										project.projectId,
										deploymentId
									)
								);
								previousMetadata = metadata;
							}
							await Promise.all(promises);
						},
						clearOnSuccess: true,
					});

					if (typeCheckErrors) {
						console.log('');
						console.log(typeCheckErrors);
						console.log('');
						fileWatcher.resume();
						// wait for a file change or shutdown to trigger a recompile
						while (!shutdownRequested && !shouldRestart) {
							await tui.spinner({
								message: 'Waiting for changes...',
								clearOnSuccess: true,
								callback: async () => {
									// Check more frequently so CTRL+C is responsive
									for (let i = 0; i < 10; i++) {
										if (shutdownRequested || shouldRestart) {
											return;
										}
										await Bun.sleep(100);
									}
								},
							});
						}
						if (shutdownRequested) {
							return;
						}
					}
				} catch (error) {
					tui.error(`Failed to build dev bundle: ${error}`);
					tui.warning('Waiting for file changes to retry...');

					// Resume watcher to detect changes for retry
					fileWatcher.resume();

					// Wait for next restart trigger
					await new Promise<void>((resolve) => {
						const checkRestart = setInterval(() => {
							if (shouldRestart) {
								clearInterval(checkRestart);
								resolve();
							}
						}, 100);
					});
					continue;
				}

				try {
					// Load SDK key from project .env files for AI Gateway routing
					// This must be set so the bundled AI SDK patches can inject the API key
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

					process.env.AGENTUITY_SDK_DEV_MODE = 'true';
					process.env.AGENTUITY_RUNTIME = 'yes';
					process.env.AGENTUITY_ENV = 'development';
					process.env.NODE_ENV = 'development';
					process.env.AGENTUITY_PROJECT_DIR = rootDir;
					if (project?.region) {
						process.env.AGENTUITY_REGION = project.region;
					}
					process.env.PORT = String(bunBackendPort);
					process.env.AGENTUITY_PORT = String(bunBackendPort);
					// Base URL points to user-facing Vite server (which proxies to Bun)
					process.env.AGENTUITY_BASE_URL =
						process.env.AGENTUITY_BASE_URL || `http://localhost:${vitePort}`;

					// Dev mode always uses no-bundle architecture
					process.env.AGENTUITY_NO_BUNDLE = 'true';

					if (opts.resume) {
						process.env.AGENTUITY_CODER_RESUME_SESSION = opts.resume;
					}

					if (project) {
						// Set environment variables for LLM provider patches
						// These must be set so the bundled patches can route LLM calls through AI Gateway
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

					// Start Bun backend server on internal port (Vite proxies to it)
					logger.debug('Starting Bun backend on internal port %d', bunBackendPort);

					await startBunDevServer({
						rootDir,
						port: bunBackendPort,
						projectId: project?.projectId,
						orgId: project?.orgId,
						deploymentId,
						logger,
						vitePort, // Still passed for reference/logging
						inspect: opts.inspect,
						inspectWait: opts.inspectWait,
						inspectBrk: opts.inspectBrk,
					});

					// Wait for app.ts to finish loading (Vite is ready but app may still be initializing)
					// Give it 2 seconds to ensure app initialization completes
					await Bun.sleep(2000);

					// Check if shutdown was requested during startup
					if (shutdownRequested) {
						break;
					}
				} catch (error) {
					tui.error(`Failed to start dev server: ${error}`);
					tui.warning('Waiting for file changes to retry...');

					// Wait for next restart trigger or shutdown
					await new Promise<void>((resolve) => {
						const checkRestart = setInterval(() => {
							if (shouldRestart || shutdownRequested) {
								clearInterval(checkRestart);
								resolve();
							}
						}, 100);
					});
					if (shutdownRequested) {
						break;
					}
					continue;
				}

				// Exit early if shutdown was requested
				if (shutdownRequested) {
					break;
				}

				try {
					// Start gravity client if we have devmode
					if (gravityBin && gravityURL && devmode && project) {
						logger.trace(
							'Starting gravity client: %s (cwd: %s, id: %s)',
							gravityBin,
							rootDir,
							devmode.id
						);
						const privateKeyPEM = devmode.privateKey ?? savedPrivateKey;
						if (!privateKeyPEM) {
							throw new Error(
								'No private key available for gravity connection. Please re-run to generate a new key.'
							);
						}
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
								detached: false, // Ensure gravity dies with parent process
							}
						);

						// Register gravity process in dev lock for cleanup tracking
						const gravityPid = (gravityProcess as { pid?: number }).pid;
						if (gravityPid) {
							await devLock.registerChild({
								pid: gravityPid,
								type: 'gravity',
								description: 'Gravity public URL tunnel',
							});
						}

						// Log gravity output and detect heartbeat port
						(async () => {
							try {
								if (gravityProcess?.stdout) {
									for await (const chunk of gravityProcess.stdout) {
										const text = new TextDecoder().decode(chunk);
										const trimmed = text.trim();

										// Check for heartbeat port announcement
										const match = trimmed.match(/^HEARTBEAT_PORT=(\d+)$/m);
										if (match?.[1]) {
											const heartbeatPort = parseInt(match[1], 10);
											logger.debug('Gravity heartbeat port detected: %d', heartbeatPort);

											// Start sending heartbeats every 5 seconds
											if (!gravityHeartbeatInterval) {
												const sendHeartbeat = async () => {
													try {
														await fetch(
															`http://127.0.0.1:${heartbeatPort}/heartbeat`,
															{
																method: 'POST',
																signal: AbortSignal.timeout(2000),
															}
														);
														logger.trace('Gravity heartbeat sent');
													} catch (err) {
														logger.trace('Gravity heartbeat failed: %s', err);
													}
												};

												// Send initial heartbeat immediately
												sendHeartbeat();

												// Then send every 5 seconds
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
										const text = new TextDecoder().decode(chunk);
										logger.warn('[gravity] %s', text.trim());
									}
								}
							} catch (err) {
								logger.error('Error reading gravity stderr: %s', err);
							}
						})();

						logger.debug('Gravity client started');
					}

					// Handle keyboard shortcuts - only register listener once
					if (
						interactive &&
						process.stdin.isTTY &&
						process.stdout.isTTY &&
						!stdinListenerRegistered
					) {
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

						// Store handler reference for cleanup
						stdinDataHandler = (data) => {
							const key = data.toString();

							// Handle Ctrl+C or q - trigger graceful shutdown
							if (key === '\u0003' || key === 'q') {
								// Remove stdin listener immediately to prevent re-entrancy
								if (stdinDataHandler) {
									process.stdin.removeListener('data', stdinDataHandler);
									stdinDataHandler = null;
								}
								// Set shutdown flag and trigger cleanup directly
								shutdownRequested = true;
								cleanup(true, 0).catch((err) => {
									logger.debug('Cleanup error: %s', err);
									originalExit(1);
								});
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

					showWelcome();

					// Start/resume file watcher now that server is ready
					fileWatcher.resume();

					// Wait for restart signal or shutdown
					await new Promise<void>((resolve) => {
						const checkRestart = setInterval(() => {
							if (shouldRestart || shutdownRequested) {
								clearInterval(checkRestart);
								resolve();
							}
						}, 100);
					});

					// Exit loop if shutdown was requested
					if (shutdownRequested) {
						break;
					}

					// Restart triggered - cleanup and loop (Vite stays running)
					logger.debug('Restarting backend server...');

					// Clean up Bun server and Gravity (Vite stays running)
					await cleanupForRestart();

					// Brief pause before restart
					await Bun.sleep(500);
				} catch (error) {
					tui.error(`Error during server operation: ${error}`);
					tui.warning('Waiting for file changes to retry...');

					// Cleanup on error (Vite stays running)
					await cleanupForRestart();

					// Exit if shutdown was requested during error handling
					if (shutdownRequested) {
						break;
					}

					// Resume file watcher to detect changes for retry
					fileWatcher.resume();

					// Wait for next restart trigger or shutdown
					await new Promise<void>((resolve) => {
						const checkRestart = setInterval(() => {
							if (shouldRestart || shutdownRequested) {
								clearInterval(checkRestart);
								resolve();
							}
						}, 100);
					});
				}
			}
		} finally {
			/* brute force clean up */
			await devLock.release();
			await killLingeringGravityProcesses(logger);
			releaseLockSync(rootDir);
		}
	},
});
