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
import { getDevmodeDeploymentId } from '../build/ast';
import { getDefaultConfigDir, saveConfig, loadProjectSDKKey } from '../../config';
import type { Config } from '../../types';
import { typecheck } from '../build/typecheck';
import { createFileWatcher } from './file-watcher';
import { regenerateSkillsAsync } from './skills';
import { prepareDevLock, releaseLockSync } from './dev-lock';

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
 */
async function stopBunServer(
	port: number,
	logger: { debug: (msg: string, ...args: unknown[]) => void }
): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const globalAny = globalThis as any;
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
		}),
	},
	optional: { auth: 'Continue without an account (local only)', project: true },

	async handler(ctx) {
		const { opts, logger, project, projectDir, auth } = ctx;
		let { config } = ctx;

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

		// Prepare dev lock: cleans up stale processes from previous sessions
		// and creates a new lockfile for this session
		const devLock = await prepareDevLock(rootDir, opts.port, logger);

		// Kill any lingering gravity processes from previous dev sessions
		// This is a fallback for cases where the lockfile was corrupted
		await killLingeringGravityProcesses(logger);

		try {
			// Setup devmode and gravity (if using public URL)
			const useMockService = process.env.DEVMODE_SYNC_SERVICE_MOCK === 'true';
			const apiClient = auth ? new APIClient(getAPIBaseURL(config), logger, config) : null;
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

			if (auth && project && opts.public) {
				// Generate devmode endpoint for public URL
				const endpoint = await tui.spinner({
					message: 'Connecting to Gravity',
					callback: () => {
						return generateEndpoint(apiClient!, project.projectId, config?.devmode?.hostname);
					},
					clearOnSuccess: true,
				});

				const _config = { ...config } as Config;
				_config.devmode = {
					hostname: endpoint.hostname,
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
					config?.gravity?.checked
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

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const cliVersion = ((global as any).__CLI_SCHEMA__?.version as string) ?? '';
			if (cliVersion) {
				regenerateSkillsAsync(rootDir, cliVersion, logger).catch(() => {});
			}

			// Start Vite asset server ONCE before restart loop
			// Vite handles frontend HMR independently and stays running across backend restarts
			let viteServer: ServerLike | null = null;
			let vitePort: number;

			try {
				logger.debug('Starting Vite asset server...');
				const viteResult = await startViteAssetServer({
					rootDir,
					logger,
					workbenchPath: workbench.config?.route,
				});
				viteServer = viteResult.server;
				vitePort = viteResult.port;

				// Update dev lock with actual Vite port
				await devLock.updatePorts({ vite: vitePort });

				logger.debug(
					`Vite asset server running on port ${vitePort} (stays running across backend restarts)`
				);
			} catch (error) {
				tui.error(`Failed to start Vite asset server: ${error}`);
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

				// Stop Bun server
				try {
					await stopBunServer(opts.port, logger);
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
					await stopBunServer(opts.port, logger);
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
						message: 'Building dev bundle',
						callback: async () => {
							// Step 0: typecheck
							typeCheckErrors = undefined;

							const typeResult = await typecheck(rootDir);
							if (!typeResult.success) {
								typeCheckErrors = typeResult.output;
								return;
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

							// Step 2: Generate entry file with workbench config
							// Note: vitePort is NOT passed here - the app reads process.env.VITE_PORT at runtime
							const { generateEntryFile } = await import('../build/entry-generator');
							await generateEntryFile({
								rootDir,
								projectId: project?.projectId ?? '',
								deploymentId,
								logger,
								mode: 'dev',
								workbench: workbenchConfigData.enabled ? workbenchConfigData : undefined,
							});

							// Step 3: Bundle the app with LLM patches (dev mode = no minification)
							// This produces .agentuity/app.js with AI Gateway routing patches applied
							const { installExternalsAndBuild } = await import(
								'../build/vite/server-bundler'
							);
							await installExternalsAndBuild({
								rootDir,
								dev: true, // DevMode: no minification, inline sourcemaps
								logger,
							});

							// Generate metadata file (needed for eval ID lookup at runtime)
							const { discoverAgents } = await import('../build/vite/agent-discovery');
							const { discoverRoutes } = await import('../build/vite/route-discovery');
							const { generateMetadata, writeMetadataFile } = await import(
								'../build/vite/metadata-generator'
							);

							const srcDir = join(rootDir, 'src');

							const promises: Promise<void>[] = [];

							// Generate/update prompt files (non-blocking)
							promises.push(
								import('../build/vite/prompt-generator')
									.then(({ generatePromptFiles }) => generatePromptFiles(srcDir, logger))
									.catch((err) =>
										logger.warn('Failed to generate prompt files: %s', err.message)
									)
							);
							const agents = await discoverAgents(
								srcDir,
								project?.projectId ?? '',
								deploymentId,
								logger
							);
							const { routes } = await discoverRoutes(
								srcDir,
								project?.projectId ?? '',
								deploymentId,
								logger
							);

							const metadata = await generateMetadata({
								rootDir,
								projectId: project?.projectId ?? '',
								orgId: project?.orgId ?? '',
								deploymentId,
								agents,
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
						while (true) {
							if (shutdownRequested) {
								return;
							}
							if (shouldRestart) {
								break;
							}
							await tui.spinner({
								message: 'Waiting for changes...',
								clearOnSuccess: true,
								callback: () => Bun.sleep(1000),
							});
						}
					}
				} catch (error) {
					tui.error(`Failed to build dev bundle: ${error}`);
					tui.warn('Waiting for file changes to retry...');

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
					// Set environment variables for LLM provider patches BEFORE starting server
					// These must be set so the bundled patches can route LLM calls through AI Gateway
					const serviceUrls = getServiceUrls(project?.region);

					// Load SDK key from project .env files for AI Gateway routing
					// This must be set so the bundled AI SDK patches can inject the API key
					if (!process.env.AGENTUITY_SDK_KEY) {
						const sdkKey = await loadProjectSDKKey(logger, rootDir);
						if (sdkKey) {
							process.env.AGENTUITY_SDK_KEY = sdkKey;
						} else if (project) {
							tui.warn(
								'AGENTUITY_SDK_KEY not found in .env file. Numerous features will be unavailable.'
							);
							tui.bullet(
								`Run "${getCommand('cloud env pull')}" to sync your SDK key, or add AGENTUITY_SDK_KEY to your .env file.`
							);
						}
					}

					process.env.AGENTUITY_SDK_DEV_MODE = 'true';
					process.env.AGENTUITY_ENV = 'development';
					process.env.NODE_ENV = 'development';
					process.env.AGENTUITY_PROJECT_DIR = rootDir;
					if (project?.region) {
						process.env.AGENTUITY_REGION = project.region;
					}
					process.env.PORT = String(opts.port);
					process.env.AGENTUITY_PORT = process.env.PORT;

					if (project) {
						process.env.AGENTUITY_TRANSPORT_URL = serviceUrls.catalyst;
						process.env.AGENTUITY_CATALYST_URL = serviceUrls.catalyst;
						process.env.AGENTUITY_VECTOR_URL = serviceUrls.vector;
						process.env.AGENTUITY_KEYVALUE_URL = serviceUrls.keyvalue;
						process.env.AGENTUITY_SANDBOX_URL = serviceUrls.sandbox;
						process.env.AGENTUITY_STREAM_URL = serviceUrls.stream;
						process.env.AGENTUITY_CLOUD_ORG_ID = project.orgId;
						process.env.AGENTUITY_CLOUD_PROJECT_ID = project.projectId;
					}

					// Set Vite port for asset proxying in bundled app
					process.env.VITE_PORT = String(vitePort);

					logger.debug('Set VITE_PORT=%s for asset proxying', process.env.VITE_PORT);

					// Start Bun dev server (Vite already running, just start backend)
					await startBunDevServer({
						rootDir,
						port: opts.port,
						projectId: project?.projectId,
						orgId: project?.orgId,
						deploymentId,
						logger,
						vitePort, // Pass port of already-running Vite server
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
					tui.warn('Waiting for file changes to retry...');

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
						gravityProcess = Bun.spawn(
							[
								gravityBin,
								'--endpoint-id',
								devmode.id,
								'--port',
								opts.port.toString(),
								'--url',
								gravityURL,
								'--log-level',
								process.env.AGENTUITY_GRAVITY_LOG_LEVEL ?? 'error',
								'--org-id',
								project.orgId,
								'--project-id',
								project.projectId,
								'--token',
								process.env.AGENTUITY_SDK_KEY!, // set above
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
										if (match) {
											const heartbeatPort = parseInt(match[1], 10);
											logger.debug(
												'Gravity heartbeat port detected: %d',
												heartbeatPort
											);

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
												gravityHeartbeatInterval = setInterval(
													sendHeartbeat,
													5000
												);
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
					tui.warn('Waiting for file changes to retry...');

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
