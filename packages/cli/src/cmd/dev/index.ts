import { z } from 'zod';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
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
import { getDefaultConfigDir, saveConfig } from '../../config';
import type { Config } from '../../types';
import { createFileWatcher } from './file-watcher';

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

		// Setup devmode and gravity (if using public URL)
		const useMockService = process.env.DEVMODE_SYNC_SERVICE_MOCK === 'true';
		const apiClient = auth ? new APIClient(getAPIBaseURL(config), logger, config) : null;
		createDevmodeSyncService({
			logger,
			apiClient,
			mock: useMockService,
		});

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

		// Start Vite asset server ONCE before restart loop
		// Vite handles frontend HMR independently and stays running across backend restarts
		let vitePort: number;
		let viteServer: ServerLike | null = null;

		try {
			logger.debug('Starting Vite asset server...');
			const viteResult = await startViteAssetServer({
				rootDir,
				logger,
				workbenchPath: workbench.config?.route,
			});
			viteServer = viteResult.server;
			vitePort = viteResult.port;
			logger.debug(
				`Vite asset server running on port ${vitePort} (stays running across backend restarts)`
			);
		} catch (error) {
			tui.error(`Failed to start Vite asset server: ${error}`);
			process.exit(1);
		}

		// Restart loop - allows BACKEND server to restart on file changes
		// Vite stays running and handles frontend changes via HMR
		let shouldRestart = false;
		let gravityProcess: ProcessLike | null = null;

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

		// Setup signal handlers once before the loop
		const cleanup = async () => {
			tui.info('Shutting down...');

			// Stop file watcher
			fileWatcher.stop();

			// Close Vite asset server first
			if (viteServer) {
				await viteServer.close();
			}

			// Kill gravity client with SIGTERM first, then SIGKILL as fallback
			if (gravityProcess) {
				try {
					gravityProcess.kill('SIGTERM');
					// Give it a moment to gracefully shutdown
					await new Promise((resolve) => setTimeout(resolve, 100));
					if (gravityProcess.exitCode === null) {
						gravityProcess.kill('SIGKILL');
					}
				} catch (err) {
					logger.debug('Error killing gravity process: %s', err);
				}
			}

			process.exit(0);
		};

		process.on('SIGINT', cleanup);
		process.on('SIGTERM', cleanup);

		// Ensure Vite and gravity are always killed on exit (even if cleanup is bypassed)
		process.on('exit', () => {
			// Close Vite server synchronously if possible
			// Note: Vite's close() is async, but we can't await in 'exit' handler
			// Most Vite implementations handle sync close gracefully
			if (viteServer) {
				try {
					viteServer.close();
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
		});

		while (true) {
			shouldRestart = false;

			// Pause file watcher during build to avoid loops
			fileWatcher.pause();

			try {
				// Generate entry file for Vite before starting dev server
				await tui.spinner({
					message: 'Generating entry file',
					callback: async () => {
						const { generateEntryFile } = await import('../build/entry-generator');
						await generateEntryFile({
							rootDir,
							projectId: project?.projectId ?? '',
							deploymentId,
							logger,
							mode: 'dev',
						});
					},
					clearOnSuccess: true,
				});
			} catch (error) {
				tui.error(`Failed to generate entry file: ${error}`);
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

				// Note: Bun server runs in-process, no separate app process needed

				// Wait for app.ts to finish loading (Vite is ready but app may still be initializing)
				// Give it 2 seconds to ensure app initialization completes
				await new Promise((resolve) => setTimeout(resolve, 2000));
			} catch (error) {
				tui.error(`Failed to start dev server: ${error}`);
				tui.warn('Waiting for file changes to retry...');

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
				// Start gravity client if we have devmode
				if (gravityBin && gravityURL && devmode) {
					logger.trace('Starting gravity client: %s', gravityBin);
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
						],
						{
							cwd: rootDir,
							stdout: 'pipe',
							stderr: 'pipe',
							detached: false, // Ensure gravity dies with parent process
						}
					);

					// Log gravity output
					(async () => {
						try {
							if (gravityProcess?.stdout) {
								for await (const chunk of gravityProcess.stdout) {
									const text = new TextDecoder().decode(chunk);
									logger.debug('[gravity] %s', text.trim());
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

				// Sync service integration
				// TODO: Integrate sync service with Vite's buildStart/buildEnd hooks
				// The sync service will be called when metadata changes are detected

				// Handle keyboard shortcuts
				if (interactive && process.stdin.isTTY && process.stdout.isTTY) {
					process.stdin.setRawMode(true);
					process.stdin.resume();
					process.stdin.setEncoding('utf8');

					const showHelp = () => {
						console.log('\n' + tui.bold('Keyboard Shortcuts:'));
						console.log(tui.muted('  h') + ' - show this help');
						console.log(tui.muted('  c') + ' - clear console');
						console.log(tui.muted('  q') + ' - quit\n');
					};

					process.stdin.on('data', (data) => {
						const key = data.toString();

						// Handle Ctrl+C
						if (key === '\u0003') {
							process.exit(0);
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
							case 'q':
								process.exit(0);
								break;
							default:
								process.stdout.write(data);
								break;
						}
					});
				}

				showWelcome();

				// Start/resume file watcher now that server is ready
				fileWatcher.resume();

				// Wait for restart signal
				await new Promise<void>((resolve) => {
					const checkRestart = setInterval(() => {
						if (shouldRestart) {
							clearInterval(checkRestart);
							resolve();
						}
					}, 100);
				});

				// Restart triggered - cleanup and loop (Vite stays running)
				logger.debug('Restarting backend server...');

				// Kill gravity client (if running)
				if (gravityProcess) {
					try {
						gravityProcess.kill('SIGTERM');
						await new Promise((resolve) => setTimeout(resolve, 100));
						if (gravityProcess.exitCode === null) {
							gravityProcess.kill('SIGKILL');
						}
					} catch (err) {
						logger.debug('Error killing gravity process during restart: %s', err);
					}
				}

				// Brief pause before restart
				await new Promise((resolve) => setTimeout(resolve, 500));
			} catch (error) {
				tui.error(`Error during server operation: ${error}`);
				tui.warn('Waiting for file changes to retry...');

				// Cleanup on error (Vite stays running)
				if (gravityProcess) {
					try {
						gravityProcess.kill('SIGTERM');
						await new Promise((resolve) => setTimeout(resolve, 100));
						if (gravityProcess.exitCode === null) {
							gravityProcess.kill('SIGKILL');
						}
					} catch (err) {
						logger.debug('Error killing gravity process on error: %s', err);
					}
				}

				// Wait for next restart trigger
				await new Promise<void>((resolve) => {
					const checkRestart = setInterval(() => {
						if (shouldRestart) {
							clearInterval(checkRestart);
							resolve();
						}
					}, 100);
				});
			}
		}
	},
});
