import { createCommand } from '../../types';
import { z } from 'zod';
import { resolve, join } from 'node:path';
import { bundle } from '../bundle/bundler';
import { existsSync, FSWatcher, watch } from 'node:fs';
import * as tui from '../../tui';

export const command = createCommand({
	name: 'dev',
	description: 'Build and run the development server',
	schema: {
		options: z.object({
			dir: z.string().optional().describe('Root directory of the project'),
		}),
	},
	optionalAuth: 'Continue without an account (local only)',

	async handler(ctx) {
		const { opts, logger } = ctx;

		const rootDir = resolve(opts.dir || process.cwd());
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

		// Track restart timestamps to detect restart loops
		const restartTimestamps: number[] = [];
		const MAX_RESTARTS = 10;
		const TIME_WINDOW_MS = 10000; // 10 seconds

		function checkRestartThrottle() {
			const now = Date.now();
			restartTimestamps.push(now);

			// Remove timestamps older than the time window
			while (restartTimestamps.length > 0 && now - restartTimestamps[0]! > TIME_WINDOW_MS) {
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
		const cleanup = () => {
			if (pid && running) {
				kill();
			}
			for (const watcher of watchers) {
				watcher.close();
			}
			watchers.length = 0;
			process.exit(0);
		};

		process.on('SIGINT', cleanup);
		process.on('SIGTERM', cleanup);

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
							building = true;
							await bundle({
								rootDir,
								dev: true,
							});
							building = false;
						} catch {
							building = false;
							failure('Build failed');
						}
					}),
				]);

				if (failed) {
					return;
				}

				if (!existsSync(appPath)) {
					failure(`App file not found: ${appPath}`);
					return;
				}

				logger.trace('Starting dev server: %s', appPath);
				// Use shell to run in a process group for proper cleanup
				// The 'exec' ensures the shell is replaced by the actual process
				devServer = Bun.spawn(['sh', '-c', `exec bun run "${appPath}"`], {
					cwd: rootDir,
					stdout: 'inherit',
					stderr: 'inherit',
					stdin: 'inherit',
				});

				running = true;
				failed = false;
				pid = devServer.pid;
				exitPromise = devServer.exited;
				logger.trace('Dev server started (pid: %d)', pid);

				// Attach non-blocking exit handler
				exitPromise
					.then((exitCode) => {
						logger.trace(
							'Dev server exited with code %d (shuttingDownForRestart=%s)',
							exitCode,
							shuttingDownForRestart
						);
						running = false;
						devServer = undefined;
						exitPromise = undefined;
						// Only exit the CLI if this is a clean exit AND not a restart
						if (exitCode === 0 && !shuttingDownForRestart) {
							logger.trace('Clean exit, stopping CLI');
							process.exit(exitCode);
						}
						// Non-zero exit codes are treated as restartable failures
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
				if (error instanceof Error) {
					failure(`Dev server failed: ${error.message}`);
				} else {
					failure('Dev server failed');
				}
				running = false;
				devServer = undefined;
			} finally {
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

		// Patterns to ignore (generated files that change during build)
		const ignorePatterns = [
			/\.generated\.(js|ts|d\.ts)$/,
			/registry\.generated\.ts$/,
			/types\.generated\.d\.ts$/,
			/client\.generated\.js$/,
		];

		logger.trace('Setting up file watchers for: %s', watches.join(', '));
		for (const watchDir of watches) {
			try {
				logger.trace('Setting up watcher for %s', watchDir);
				const watcher = watch(watchDir, { recursive: true }, (eventType, changedFile) => {
					const absPath = changedFile ? join(watchDir, changedFile) : watchDir;

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
					if (absPath.startsWith(agentuityDir)) {
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

					// Ignore generated files to prevent restart loops
					if (changedFile) {
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
		await new Promise(() => {});
	},
});
