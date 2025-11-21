/** biome-ignore-all lint/style/useTemplate: its easier */
import { z } from 'zod';
import type { BuildMetadata } from '@agentuity/server';
import { resolve, join } from 'node:path';
import { bundle } from '../bundle/bundler';
import { getBuildMetadata } from '../bundle/plugin';
import { existsSync, type FSWatcher, watch, statSync, readdirSync } from 'node:fs';
import { getDefaultConfigDir, loadProjectSDKKey, saveProjectDir, saveConfig } from '../../config';
import { type Config, createCommand } from '../../types';
import * as tui from '../../tui';
import { createAgentTemplates, createAPITemplates } from './templates';
import { generateEndpoint, type DevmodeResponse } from './api';
import { APIClient, getAPIBaseURL } from '../../api';
import { download } from './download';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'dev',
	description: 'Build and run the development server',
	tags: ['mutating', 'slow', 'requires-project'],
	idempotent: true,
	examples: [
		getCommand('dev'),
		getCommand('dev --port 8080'),
		getCommand('dev --local'),
		getCommand('dev --no-public'),
	],
	schema: {
		options: z.object({
			local: z.boolean().optional().describe('Turn on local services (instead of cloud)'),
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
		}),
	},
	optional: { auth: 'Continue without an account (local only)', project: true },

	async handler(ctx) {
		const { opts, logger, options, project, projectDir, auth } = ctx;
		let { config } = ctx;

		const rootDir = projectDir;
		const appTs = join(rootDir, 'app.ts');
		const srcDir = join(rootDir, 'src');
		const mustHaves = [join(rootDir, 'package.json'), appTs, srcDir];
		const missing: string[] = [];

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

		if (auth && project && opts.public) {
			// Only create apiClient if auth is available
			const apiClient = new APIClient(getAPIBaseURL(config), logger, config);
			const endpoint = await tui.spinner({
				message: 'Connecting to Gravity',
				callback: () => {
					return generateEndpoint(apiClient, project.projectId, config?.devmode?.hostname);
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
		}

		if (devmode) {
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

		const canDoInput = !!(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);

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
		env.PORT = Number(opts.port).toFixed();
		env.AGENTUITY_PORT = env.PORT;
		if (options.logLevel !== undefined) env.AGENTUITY_LOG_LEVEL = options.logLevel;
		// Pass through AGENTUITY_SDK_LOG_LEVEL for internal SDK logger
		if (process.env.AGENTUITY_SDK_LOG_LEVEL) {
			env.AGENTUITY_SDK_LOG_LEVEL = process.env.AGENTUITY_SDK_LOG_LEVEL;
		}
		env.AGENTUITY_FORCE_LOCAL_SERVICES = opts.local === true ? 'true' : 'false';
		if (config?.overrides?.transport_url) {
			env.AGENTUITY_TRANSPORT_URL = config.overrides.transport_url;
		}
		if (config?.overrides?.catalyst_url) {
			env.AGENTUITY_CATALYST_URL = config.overrides.catalyst_url;
		}
		if (config?.overrides?.vector_url) {
			env.AGENTUITY_VECTOR_URL = config.overrides.vector_url;
		}
		if (config?.overrides?.object_url) {
			env.AGENTUITY_OBJECTSTORE_URL = config.overrides.object_url;
		}
		if (config?.overrides?.kv_url) {
			env.AGENTUITY_KEYVALUE_URL = config.overrides.kv_url;
		}
		if (config?.overrides?.stream_url) {
			env.AGENTUITY_STREAM_URL = config.overrides.stream_url;
		}
		if (project) {
			env.AGENTUITY_CLOUD_ORG_ID = project.orgId;
			env.AGENTUITY_CLOUD_PROJECT_ID = project.projectId;
		}
		if (!process.stdout.isTTY) {
			env.NO_COLOR = '1';
		}

		const agentuityDir = resolve(rootDir, '.agentuity');
		const appPath = resolve(agentuityDir, 'app.js');

		// Watch directories instead of files to survive atomic replacements (sed -i, cp)
		const watches = [rootDir];
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

		if (gravityBin && devmode && project) {
			const sdkKey = await loadProjectSDKKey(rootDir);
			if (!sdkKey) {
				tui.warning(`Couldn't find the AGENTUITY_SDK_KEY in ${rootDir} .env file`);
			} else {
				const gravityBinExists = await Bun.file(gravityBin).exists();
				if (!gravityBinExists) {
					logger.error(
						`Gravity binary not found at ${gravityBin}, skipping gravity client startup`
					);
				} else {
					try {
						gravityClient = Bun.spawn(
							[
								gravityBin,
								'--endpoint-id',
								devmode.id,
								'--port',
								env.PORT,
								'--url',
								config?.overrides?.gravity_url ?? 'grpc://devmode.agentuity.com',
								'--log-level',
								'error',
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

		function failure(msg: string) {
			failed = true;
			failures++;
			if (failures >= 5) {
				tui.error(msg);
				tui.fatal('too many failures, exiting');
			} else {
				setImmediate(() => tui.error(msg));
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
					await kill();
					logger.trace('Server killed, continuing with restart');
					// Continue with restart after kill completes
				} else {
					logger.trace('Initial server start');
				}
				logger.trace('Starting typecheck and build...');
				await Promise.all([
					tui.runCommand({
						command: 'tsc',
						cmd: ['bunx', 'tsc', '--noEmit'],
						cwd: rootDir,
						clearOnSuccess: true,
						truncate: false,
						maxLinesOutput: 2,
						maxLinesOnFailure: 15,
					}),
					tui.spinner('Building project', async () => {
						try {
							logger.trace('Bundle starting...');
							building = true;
							await bundle({
								rootDir,
								dev: true,
							});
							building = false;
							buildCompletedAt = Date.now();
							logger.trace('Bundle completed successfully');
						} catch (error) {
							building = false;
							logger.trace('Bundle failed: %s', error);
							failure('Build failed');
						}
					}),
				]);
				logger.trace('Typecheck and build completed');

				if (failed) {
					logger.trace('Restart failed, returning early');
					return;
				}

				logger.trace('Checking if app file exists: %s', appPath);
				if (!existsSync(appPath)) {
					logger.trace('App file not found: %s', appPath);
					failure(`App file not found: ${appPath}`);
					return;
				}
				logger.trace('App file exists, getting build metadata...');

				metadata = getBuildMetadata();
				logger.trace('Build metadata retrieved');

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
				}

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
						if (changedFile?.startsWith('src/agents/')) {
							logger.debug('agent directory created: %s', changedFile);
							createAgentTemplates(absPath);
						} else if (changedFile?.startsWith('src/apis/')) {
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
