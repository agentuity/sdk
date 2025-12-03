/** biome-ignore-all lint/style/useTemplate: its easier */
import { z } from 'zod';
import { resolve, join } from 'node:path';
import { bundle } from '../build/bundler';
import { getServiceUrls } from '@agentuity/server';
import { getBuildMetadata } from '../build/plugin';
import { existsSync, type FSWatcher, watch, statSync, readdirSync } from 'node:fs';
import {
	getDefaultConfigDir,
	loadProjectSDKKey,
	saveProjectDir,
	saveConfig,
	loadBuildMetadata,
} from '../../config';
import { type Config, createCommand } from '../../types';
import * as tui from '../../tui';
import { createAgentTemplates, createAPITemplates } from './templates';
import { generateEndpoint, type DevmodeResponse } from './api';
import { APIClient, getAPIBaseURL, getGravityDevModeURL } from '../../api';
import { download } from './download';
import { createDevmodeSyncService } from './sync';
import { getDevmodeDeploymentId } from '../build/ast';
import { BuildMetadata } from '@agentuity/server';
import { getCommand } from '../../command-prefix';
import { notifyWorkbenchClients } from '../../utils/workbench-notify';

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
				.min(1024) // should we allow a lower root port? probably not?
				.max(65535)
				.default(3500)
				.describe('The TCP port to start the dev start'),
			watch: z
				.array(z.string())
				.optional()
				.describe(
					'Additional paths to watch for changes (e.g., --watch ../packages/workbench/dist)'
				),
		}),
	},
	optional: { auth: 'Continue without an account (local only)', project: true },

	async handler(ctx) {
		const { opts, logger, options, project, projectDir, auth } = ctx;
		let { config } = ctx;

		// Allow sync with mock service even without devmode endpoint
		const useMockService = process.env.DEVMODE_SYNC_SERVICE_MOCK === 'true';
		const apiClient = new APIClient(getAPIBaseURL(config), logger, config);
		const syncService = createDevmodeSyncService({ logger, apiClient, mock: useMockService });

		const rootDir = projectDir;
		const appTs = join(rootDir, 'app.ts');
		const srcDir = join(rootDir, 'src');
		const mustHaves = [join(rootDir, 'package.json'), appTs, srcDir];
		const missing: string[] = [];

		const interactive = !shouldDisableInteractive(opts.interactive);

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
			process.exit(1);
		}

		await saveProjectDir(rootDir);

		let devmode: DevmodeResponse | undefined;
		let gravityBin: string | undefined;
		let gravityURL: string | undefined;

		if (auth && project && opts.public) {
			// Generate devmode endpoint only when using --public
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
			logger.error('gravity url: %s', gravityURL);
		}

		logger.debug(
			'Getting devmode deployment id for projectId: %s, endpointId: %s',
			project?.projectId,
			devmode?.id
		);
		const deploymentId = getDevmodeDeploymentId(project?.projectId ?? '', devmode?.id ?? '');

		if (devmode && opts.public) {
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

		const canDoInput =
			interactive && !!(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);

		const devmodebody =
			tui.muted(tui.padRight('Local:', 10)) +
			tui.link(`http://127.0.0.1:${opts.port}`) +
			'\n' +
			tui.muted(tui.padRight('Public:', 10)) +
			(devmode?.hostname ? tui.link(`https://${devmode.hostname}`) : tui.warn('Disabled')) +
			'\n' +
			(canDoInput
				? '\n' + tui.muted('Press ') + tui.bold('h') + tui.muted(' for keyboard shortcuts')
				: '');

		function showBanner() {
			tui.banner('⨺ Agentuity DevMode', devmodebody, {
				padding: 2,
				topSpacer: false,
				bottomSpacer: false,
				centerTitle: false,
			});
		}

		showBanner();

		const env = { ...process.env };
		env.AGENTUITY_SDK_DEV_MODE = 'true';
		env.AGENTUITY_ENV = 'development';
		env.NODE_ENV = 'development';
		env.AGENTUITY_REGION = project?.region;
		env.PORT = Number(opts.port).toFixed();
		env.AGENTUITY_PORT = env.PORT;
		const serviceUrls = getServiceUrls(project?.region);
		if (options.logLevel !== undefined) env.AGENTUITY_LOG_LEVEL = options.logLevel;
		// Pass through AGENTUITY_SDK_LOG_LEVEL for internal SDK logger
		if (process.env.AGENTUITY_SDK_LOG_LEVEL) {
			env.AGENTUITY_SDK_LOG_LEVEL = process.env.AGENTUITY_SDK_LOG_LEVEL;
		}
		env.AGENTUITY_FORCE_LOCAL_SERVICES = opts.local === true ? 'true' : 'false';
		if (project) {
			env.AGENTUITY_TRANSPORT_URL = serviceUrls.catalyst;
			env.AGENTUITY_CATALYST_URL = serviceUrls.catalyst;
			env.AGENTUITY_VECTOR_URL = serviceUrls.vector;
			env.AGENTUITY_OBJECTSTORE_URL = serviceUrls.objectstore;
			env.AGENTUITY_KEYVALUE_URL = serviceUrls.keyvalue;
			env.AGENTUITY_STREAM_URL = serviceUrls.stream;
			env.AGENTUITY_CLOUD_ORG_ID = project.orgId;
			env.AGENTUITY_CLOUD_PROJECT_ID = project.projectId;
		}
		if (!process.stdout.isTTY) {
			env.NO_COLOR = '1';
		}

		const agentuityDir = resolve(rootDir, '.agentuity');
		const appPath = resolve(agentuityDir, 'app.js');

		// Load existing metadata file to use as previousMetadata for sync
		// This prevents reinserting agents/evals that haven't changed
		let previousMetadata: BuildMetadata | undefined;
		try {
			previousMetadata = await loadBuildMetadata(agentuityDir);
			logger.debug(
				'Loaded previous metadata with %d agent(s)',
				previousMetadata.agents?.length ?? 0
			);
		} catch (_error) {
			// File doesn't exist yet (first run), that's okay
			logger.debug('No previous metadata file found, will treat all agents/evals as new');
			previousMetadata = undefined;
		}

		// Watch directories instead of files to survive atomic replacements (sed -i, cp)
		const watches = [rootDir];

		// Add additional watch paths from options
		if (opts.watch) {
			for (const watchPath of opts.watch) {
				const resolvedPath = resolve(rootDir, watchPath);
				if (existsSync(resolvedPath)) {
					watches.push(resolvedPath);
					logger.debug('Added additional watch path: %s', resolvedPath);
				} else {
					logger.warn('Watch path does not exist: %s', resolvedPath);
				}
			}
		}
		const watchers: FSWatcher[] = [];
		let failures = 0;
		let running = false;
		let pid = 0;
		let failed = false;
		let devServer: Bun.Subprocess | undefined;
		let exitPromise: Promise<number> | undefined;
		let restarting = false;
		let shuttingDownForRestart = false;
		let pendingRestart = false;
		let building = false;
		let buildCompletedAt = 0;
		const BUILD_COOLDOWN_MS = 500; // Ignore file changes for 500ms after build completes
		let metadata: Partial<BuildMetadata> | undefined;
		let showInitialReadyMessage = true;
		let serverStartTime = 0;
		let gravityClient: Bun.Subprocess | undefined;
		let initialStartupComplete = false;

		const sdkKey = await loadProjectSDKKey(logger, rootDir);
		if (!sdkKey) {
			tui.warning(`Couldn't find the AGENTUITY_SDK_KEY in ${rootDir} .env file`);
		}
		const gravityBinExists = gravityBin ? await Bun.file(gravityBin).exists() : true;
		if (!gravityBinExists) {
			logger.error(`Gravity binary not found at ${gravityBin}, skipping gravity client startup`);
		}

		async function restartGravityClient() {
			if (gravityClient) {
				gravityClient.kill('SIGINT');
				gravityClient.kill();
			}
			if (!devmode || !opts.public) {
				return;
			}
			try {
				gravityClient = Bun.spawn(
					[
						gravityBin!,
						'--endpoint-id',
						devmode.id,
						'--port',
						env.PORT!,
						'--url',
						gravityURL!,
						'--log-level',
						process.env.AGENTUITY_GRAVITY_LOG_LEVEL ?? 'error',
					],
					{
						cwd: rootDir,
						stdout: 'inherit',
						stderr: 'inherit',
						stdin: 'ignore',
						env: { ...env, AGENTUITY_SDK_KEY: sdkKey },
					}
				);
				gravityClient.exited.then(() => {
					logger.debug('gravity client exited');
				});
			} catch (err) {
				logger.error(
					'Failed to spawn gravity client: %s',
					err instanceof Error ? err.message : String(err)
				);
			}
		}

		// Track restart timestamps to detect restart loops
		const restartTimestamps: number[] = [];
		const MAX_RESTARTS = 10;
		const TIME_WINDOW_MS = 10000; // 10 seconds

		function checkRestartThrottle() {
			const now = Date.now();
			restartTimestamps.push(now);

			// Remove timestamps older than the time window
			while (restartTimestamps.length > 0 && now - restartTimestamps[0] > TIME_WINDOW_MS) {
				restartTimestamps.shift();
			}

			// Check if we've exceeded the threshold
			if (restartTimestamps.length >= MAX_RESTARTS) {
				tui.error(`Detected ${MAX_RESTARTS} restarts in ${TIME_WINDOW_MS / 1000} seconds`);
				tui.error(
					'This usually indicates a file watcher loop (e.g., log files in the project root)'
				);
				tui.fatal('Too many rapid restarts, exiting to prevent infinite loop');
			}
		}

		let lastErrorLineCount = 0;
		let showedRestartMessage = false;

		function clearRestartMessage() {
			if (showedRestartMessage) {
				process.stdout.write('\x1b[1A\x1b[2K');
				showedRestartMessage = false;
			}
		}

		function failure(msg: string) {
			failed = true;
			failures++;
			// Exit immediately on initial startup failure
			if (!initialStartupComplete) {
				tui.fatal(msg);
			}
			// During hot reload, show error but don't exit unless too many failures
			if (failures >= 5) {
				tui.error(msg);
				tui.fatal('too many failures, exiting');
			} else {
				// Ensure we're on a new line before printing error
				tui.error(msg);
				// Track lines: 1 for "✗ Building..." + 1 for error message
				lastErrorLineCount = 2;
			}
		}

		function clearLastError() {
			if (lastErrorLineCount > 0) {
				// Move cursor up and clear each line
				for (let i = 0; i < lastErrorLineCount; i++) {
					process.stdout.write('\x1b[1A\x1b[2K');
				}
				lastErrorLineCount = 0;
			}
		}

		const kill = async () => {
			if (!running || !devServer) {
				logger.trace('kill() called but server not running');
				return;
			}

			logger.trace('Killing dev server (pid: %d)', pid);
			shuttingDownForRestart = true;
			running = false;
			process.kill(pid, 'SIGINT');
			try {
				// Kill the process group (negative PID kills entire group)
				process.kill(-pid, 'SIGTERM');
				logger.trace('Sent SIGTERM to process group');
			} catch {
				// Fallback: kill the direct process
				try {
					if (devServer) {
						devServer.kill();
						logger.trace('Killed dev server process directly');
					}
				} catch {
					// Ignore if already dead
					logger.trace('Process already dead');
				}
			}

			// Wait for the server to actually exit
			if (exitPromise) {
				logger.trace('Waiting for dev server to exit...');
				await exitPromise;
				logger.trace('Dev server exited');
			}

			devServer = undefined;
			exitPromise = undefined;
			shuttingDownForRestart = false;
		};

		// Handle signals to ensure entire process tree is killed
		const cleanup = (exitCode = 0) => {
			logger.trace('cleanup() called with exitCode=%d', exitCode);
			if (gravityClient) {
				logger.debug('calling kill on gravity client with pid: %d', gravityClient.pid);
				gravityClient.kill('SIGINT');
				gravityClient = undefined;
			}
			if (pid && running) {
				kill();
			}
			for (const watcher of watchers) {
				watcher.close();
			}
			watchers.length = 0;
			process.exit(exitCode);
		};

		process.on('SIGINT', cleanup);
		process.on('SIGTERM', cleanup);
		process.on('SIGQUIT', cleanup);
		process.on('exit', () => {
			// Synchronous cleanup on exit
			if (gravityClient) {
				try {
					gravityClient.kill('SIGINT');
				} catch {
					// Ignore errors
				}
			}
		});

		async function restart() {
			// Queue restart if already restarting
			if (restarting) {
				logger.trace('Restart already in progress, queuing another restart');
				pendingRestart = true;
				return;
			}

			logger.trace('restart() called, restarting=%s, running=%s', restarting, running);
			restarting = true;
			pendingRestart = false;
			failed = false;
			try {
				if (running) {
					logger.trace('Server is running, killing before restart');
					checkRestartThrottle();
					tui.info('Restarting on file change');
					showedRestartMessage = true;

					// Notify workbench clients before killing the server
					await notifyWorkbenchClients({
						port: opts.port,
						message: 'restarting',
					});

					// Small delay to ensure the restart message is processed before killing server
					await new Promise((resolve) => setTimeout(resolve, 200));

					await kill();
					logger.trace('Server killed, continuing with restart');
					// Continue with restart after kill completes
				} else {
					logger.trace('Initial server start');
				}
				logger.trace('Starting typecheck and build...');

				// Clear any previous error before starting new build
				clearLastError();
				clearRestartMessage();

				try {
					await tui.spinner({
						message: 'Building...',
						clearOnSuccess: true,
						callback: async () => {
							logger.trace('Bundle starting...');
							building = true;
							await bundle({
								rootDir,
								dev: true,
								projectId: project?.projectId,
								deploymentId,
								port: opts.port,
							});
							building = false;
							buildCompletedAt = Date.now();
							logger.trace('Bundle completed successfully');
							logger.trace('tsc starting...');
							const tscExitCode = await tui.runCommand({
								command: 'tsc',
								cmd: ['bunx', 'tsc', '--noEmit'],
								cwd: rootDir,
								clearOnSuccess: true,
								truncate: false,
								maxLinesOutput: 2,
								maxLinesOnFailure: 15,
							});
							if (tscExitCode !== 0) {
								logger.trace('tsc failed with exit code %d', tscExitCode);
								failure('Type check failed');
								return;
							}
							logger.trace('tsc completed successfully');
							await restartGravityClient();
						},
					});
				} catch (error) {
					building = false;
					const e = error as Error;
					if (e.constructor.name === 'AggregateError') {
						const ex = e as AggregateError;
						for (const err of ex.errors) {
							if (err) {
								failure(err);
								return;
							}
						}
						return;
					}
					const errorMsg = error instanceof Error ? error.message : String(error);
					failure(errorMsg);
					return;
				}

				logger.trace('Typecheck and build completed');

				if (failed) {
					logger.trace('Restart failed, returning early');
					return;
				}

				// Reset failure counter on successful build
				failures = 0;

				logger.trace('Checking if app file exists: %s', appPath);
				if (!existsSync(appPath)) {
					logger.trace('App file not found: %s', appPath);
					failure(`App file not found: ${appPath}`);
					return;
				}
				logger.trace('App file exists, getting build metadata...');

				metadata = getBuildMetadata();
				logger.trace('Build metadata retrieved');

				// Sync agents and evals to API if in devmode with auth
				if (auth && project && apiClient) {
					try {
						logger.debug('Loading build metadata for sync...');
						const currentMetadata = await loadBuildMetadata(agentuityDir);
						logger.debug(
							'Found %d agent(s) and %d route(s) in metadata',
							currentMetadata.agents?.length ?? 0,
							currentMetadata.routes?.length ?? 0
						);
						if (currentMetadata.agents) {
							for (const agent of currentMetadata.agents) {
								logger.debug(
									'Agent: id=%s, name=%s, version=%s, evals=%d',
									agent.id,
									agent.name,
									agent.version,
									agent.evals?.length ?? 0
								);
								if (agent.evals) {
									for (const evalItem of agent.evals) {
										logger.debug(
											'  Eval: id=%s, name=%s, version=%s',
											evalItem.id,
											evalItem.name,
											evalItem.version
										);
									}
								}
							}
						}
						logger.debug('Syncing agents and evals...');

						await syncService.sync(
							currentMetadata,
							previousMetadata,
							project.projectId,
							deploymentId
						);
						previousMetadata = currentMetadata;
						logger.debug('Sync completed successfully');
					} catch (error) {
						logger.error('Failed to sync agents/evals: %s', error);
						if (error instanceof Error) {
							logger.error('Error stack: %s', error.stack);
						}
						// Don't fail the build, just log the error
					}
				} else {
					logger.trace(
						'Skipping sync - auth=%s, project=%s, devmode=%s, apiClient=%s',
						!!auth,
						!!project,
						!!devmode,
						!!apiClient
					);
				}

				logger.trace('Starting dev server: %s', appPath);
				// Use shell to run in a process group for proper cleanup
				// The 'exec' ensures the shell is replaced by the actual process
				logger.trace('Spawning dev server process...');
				devServer = Bun.spawn(['sh', '-c', `exec bun run "${appPath}"`], {
					cwd: rootDir,
					stdout: 'inherit',
					stderr: 'inherit',
					stdin: process.stdin.isTTY ? 'ignore' : 'inherit', // Don't inherit stdin, we handle it ourselves
					env,
				});

				logger.trace('Dev server process spawned, setting up state...');
				running = true;
				failed = false;
				pid = devServer.pid;
				exitPromise = devServer.exited;
				serverStartTime = Date.now();
				logger.trace('Dev server started (pid: %d)', pid);

				if (showInitialReadyMessage) {
					showInitialReadyMessage = false;
					logger.info('DevMode ready 🚀');
					logger.trace('Initial ready message logged');
					// Mark initial startup complete immediately to prevent watcher restarts
					initialStartupComplete = true;
					logger.trace('Initial startup complete, file watcher restarts now enabled');
				}

				// Notify workbench clients that the server is alive and ready
				// Use setTimeout to ensure server is fully ready before notifying
				setTimeout(async () => {
					await notifyWorkbenchClients({
						port: opts.port,
						message: 'alive',
					});
				}, 500);

				logger.trace('Attaching exit handler to dev server process...');
				// Attach non-blocking exit handler
				exitPromise
					.then((exitCode) => {
						const runtime = Date.now() - serverStartTime;
						logger.trace(
							'Dev server exited with code %d (shuttingDownForRestart=%s, runtime=%dms)',
							exitCode,
							shuttingDownForRestart,
							runtime
						);
						running = false;
						devServer = undefined;
						exitPromise = undefined;
						// If server exited immediately after starting (< 2 seconds), treat as failure and restart
						if (runtime < 2000 && !shuttingDownForRestart) {
							logger.trace('Server exited too quickly, treating as failure and restarting');
							failure('Server exited immediately after starting');
							// Trigger a restart after a short delay
							setTimeout(() => {
								if (!running && !restarting) {
									logger.trace('Triggering restart after quick exit');
									restart();
								}
							}, 100);
							return;
						}
						// Only exit the CLI if this is a clean exit AND not a restart AND server ran for a while
						if (exitCode === 0 && !shuttingDownForRestart && runtime >= 2000) {
							logger.trace('Clean exit, stopping CLI');
							cleanup(exitCode);
						}
						// Non-zero exit codes are treated as restartable failures
						// But if it's exit code 1 (common error exit), also exit the CLI
						if (exitCode === 1 && !shuttingDownForRestart && runtime >= 2000) {
							logger.trace('Server exited with error code 1, stopping CLI');
							cleanup(exitCode);
						}
					})
					.catch((error) => {
						logger.trace(
							'Dev server exit error (shuttingDownForRestart=%s): %s',
							shuttingDownForRestart,
							error
						);
						running = false;
						devServer = undefined;
						exitPromise = undefined;
						if (!shuttingDownForRestart) {
							if (error instanceof Error) {
								failure(`Dev server failed: ${error.message}`);
							} else {
								failure('Dev server failed');
							}
						}
					});
			} catch (error) {
				logger.trace('Restart caught error: %s', error);
				if (error instanceof Error) {
					logger.trace('Error message: %s, stack: %s', error.message, error.stack);
					failure(`Dev server failed: ${error.message}`);
				} else {
					logger.trace('Non-Error exception: %s', String(error));
					failure('Dev server failed');
				}
				running = false;
				devServer = undefined;
			} finally {
				logger.trace('Entering restart() finally block...');
				const hadPendingRestart = pendingRestart;
				restarting = false;
				pendingRestart = false;
				logger.trace(
					'restart() completed, restarting=%s, hadPendingRestart=%s',
					restarting,
					hadPendingRestart
				);

				// If another restart was queued while we were restarting, trigger it now
				if (hadPendingRestart) {
					logger.trace('Triggering queued restart');
					setImmediate(restart);
				}
			}
		}

		logger.trace('Starting initial build and server');
		await restart();
		logger.trace('Initial restart completed, setting up watchers');
		logger.trace('initialStartupComplete is now: %s', initialStartupComplete);

		// Setup keyboard shortcuts (only if we have a TTY)
		if (canDoInput) {
			logger.trace('Setting up keyboard shortcuts');
			process.stdin.setRawMode(true);
			process.stdin.resume();
			process.stdin.setEncoding('utf8');

			const showHelp = () => {
				console.log('\n' + tui.bold('Keyboard Shortcuts:'));
				console.log(tui.muted('  h') + ' - show this help');
				console.log(tui.muted('  c') + ' - clear console');
				console.log(tui.muted('  r') + ' - restart server');
				console.log(tui.muted('  o') + ' - show routes');
				console.log(tui.muted('  a') + ' - show agents');
				console.log(tui.muted('  q') + ' - quit\n');
			};

			const showRoutes = () => {
				tui.info('API Route Detail');
				tui.table(metadata?.routes ?? [], ['method', 'path', 'filename']);
			};

			const showAgents = () => {
				tui.info('Agent Detail');
				tui.table(metadata?.agents ?? [], ['name', 'filename', 'description']);
			};

			process.stdin.on('data', (data) => {
				const key = data.toString();

				// Handle Ctrl+C
				if (key === '\u0003') {
					cleanup();
					return;
				}

				// Handle other shortcuts
				switch (key) {
					case 'h':
						showHelp();
						break;
					case 'c':
						console.clear();
						showBanner();
						break;
					case 'r':
						tui.info('Manually restarting server...');
						restart();
						break;
					case 'o':
						showRoutes();
						break;
					case 'a':
						showAgents();
						break;
					case 'q':
						tui.info('Shutting down...');
						cleanup();
						break;
				}
			});

			logger.trace('✓ Keyboard shortcuts enabled');
		} else {
			if (process.stdin) {
				// still need to monitor stdin in case we are pipeing into another process or file etc
				if (typeof process.stdin.setRawMode === 'function') {
					process.stdin.setRawMode(true);
				}
				process.stdin.resume();
				process.stdin.on('data', (data) => {
					const key = data.toString();
					// Handle Ctrl+C
					if (key === '\u0003') {
						cleanup();
						return;
					}
				});
			}
			logger.trace('❌ Keyboard shortcuts disabled');
		}

		// Patterns to ignore (generated files that change during build)
		const ignorePatterns = [
			/\.generated\.(js|ts|d\.ts)$/,
			/registry\.generated\.ts$/,
			/types\.generated\.d\.ts$/,
			/client\.generated\.js$/,
			/\.tmp$/,
			/\.tsbuildinfo$/,
			/\.agentuity\//,
			// Ignore temporary files created by sed (e.g., sedUprJj0)
			/\/sed[A-Za-z0-9]+$/,
		];

		// Helper to check if a file is a temporary file created by sed
		const isSedTempFile = (filePath: string): boolean => {
			const basename = filePath.split('/').pop() || '';
			return /^sed[A-Za-z0-9]+$/.test(basename);
		};

		logger.trace('Setting up file watchers for: %s', watches.join(', '));
		for (const watchDir of watches) {
			try {
				logger.trace('Setting up watcher for %s', watchDir);
				const watcher = watch(watchDir, { recursive: true }, (eventType, changedFile) => {
					const absPath = changedFile ? resolve(watchDir, changedFile) : watchDir;

					// Ignore file changes during initial startup to prevent spurious restarts
					if (!initialStartupComplete) {
						logger.trace(
							'File change ignored (initial startup): %s (event: %s, file: %s)',
							watchDir,
							eventType,
							changedFile
						);
						return;
					}

					// Ignore file changes during active build to prevent loops
					if (building) {
						logger.trace(
							'File change ignored (build in progress): %s (event: %s, file: %s)',
							watchDir,
							eventType,
							changedFile
						);
						return;
					}

					// Ignore file changes immediately after build completes (cooldown period)
					// This prevents restarts from build output files that are written asynchronously
					if (buildCompletedAt > 0 && Date.now() - buildCompletedAt < BUILD_COOLDOWN_MS) {
						logger.trace(
							'File change ignored (build cooldown): %s (event: %s, file: %s)',
							watchDir,
							eventType,
							changedFile
						);
						return;
					}

					// Ignore node_modules folder
					if (absPath.includes('node_modules')) {
						logger.trace(
							'File change ignored (node_modules): %s (event: %s, file: %s)',
							watchDir,
							eventType,
							changedFile
						);
						return;
					}

					// Ignore changes in .agentuity directory (build output)
					// Check both relative path and normalized absolute path
					const isInAgentuityDir =
						(changedFile &&
							(changedFile === '.agentuity' || changedFile.startsWith('.agentuity/'))) ||
						resolve(absPath).startsWith(agentuityDir);
					if (isInAgentuityDir) {
						logger.trace(
							'File change ignored (.agentuity dir): %s (event: %s, file: %s)',
							watchDir,
							eventType,
							changedFile
						);
						return;
					}

					// Ignore changes to src/web/public directory (static assets, not code)
					if (changedFile && changedFile === 'src/web/public') {
						logger.trace(
							'File change ignored (static assets dir): %s (event: %s, file: %s)',
							watchDir,
							eventType,
							changedFile
						);
						return;
					}

					// Check for .tmp file renames that replace watched files (BEFORE ignoring)
					// This handles cases like sed -i.tmp where agent.ts.tmp is renamed to agent.ts
					if (eventType === 'rename' && changedFile && changedFile.endsWith('.tmp')) {
						const targetFile = changedFile.slice(0, -4); // Remove .tmp suffix
						const targetAbsPath = resolve(watchDir, targetFile);

						// Only trigger restart for source files (ts, tsx, js, jsx, etc.)
						const isSourceFile = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(targetFile);

						// Check if target file exists and is not in ignored directories
						const targetExists = existsSync(targetAbsPath);
						const inNodeModules = targetAbsPath.includes('node_modules');
						const inAgentuityDir =
							(targetFile &&
								(targetFile === '.agentuity' || targetFile.startsWith('.agentuity/'))) ||
							resolve(targetAbsPath).startsWith(agentuityDir);
						let isDirectory = false;
						if (targetExists) {
							try {
								isDirectory = statSync(targetAbsPath).isDirectory();
							} catch (err) {
								logger.trace('Failed to stat target file: %s', err);
							}
						}

						if (
							isSourceFile &&
							targetExists &&
							!inNodeModules &&
							!inAgentuityDir &&
							!isDirectory
						) {
							logger.trace(
								'File change detected (temp file rename): %s -> %s',
								absPath,
								targetAbsPath
							);
							restart();
							return;
						}
					}

					// Ignore generated files to prevent restart loops
					if (changedFile) {
						// Check for sed temporary files
						if (isSedTempFile(changedFile)) {
							logger.trace(
								'File change ignored (sed temp file): %s (event: %s, file: %s)',
								watchDir,
								eventType,
								changedFile
							);
							return;
						}
						// Check other ignore patterns
						for (const pattern of ignorePatterns) {
							if (pattern.test(changedFile)) {
								logger.trace(
									'File change ignored (generated file): %s (event: %s, file: %s)',
									watchDir,
									eventType,
									changedFile
								);
								return;
							}
						}
					}

					if (
						eventType === 'rename' &&
						existsSync(absPath) &&
						statSync(absPath).isDirectory() &&
						readdirSync(absPath).length === 0
					) {
						if (changedFile?.startsWith('src/agent/')) {
							logger.debug('agent directory created: %s', changedFile);
							createAgentTemplates(absPath);
						} else if (changedFile?.startsWith('src/web/')) {
							logger.debug('api directory created: %s', changedFile);
							createAPITemplates(absPath);
						}
					}

					logger.trace(
						'File change detected: %s (event: %s, file: %s)',
						absPath,
						eventType,
						changedFile
					);
					restart();
				});
				watchers.push(watcher);
				logger.trace('✓ Watcher added for %s', watchDir);
			} catch (error) {
				logger.error('Failed to setup watcher for %s: %s', watchDir, error);
			}
		}
		logger.debug('Dev server watching for changes');

		// Keep the handler alive indefinitely
		await new Promise(() => {}).catch(() => cleanup());
	},
});
