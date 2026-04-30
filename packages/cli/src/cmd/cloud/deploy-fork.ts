/**
 * Deploy fork wrapper
 *
 * This module implements a fork-based deployment wrapper that:
 * 1. Spawns the deploy command as a child process using bunx
 * 2. Tees stdout/stderr to both the terminal and a Pulse stream
 * 3. On failure, sends diagnostics to the API
 *
 * This approach captures crashes, Bun runtime issues, and all output
 * for debugging failed deployments.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import {
	appendFileSync,
	createReadStream,
	createWriteStream,
	existsSync,
	readFileSync,
	statSync,
	unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import type { Logger } from '@agentuity/core';
import { type ClientDiagnostics, type Deployment, projectDeploymentFail } from '@agentuity/server';
import { getAgentEnv } from '../../agent-detection.ts';
import type { APIClient } from '../../api.ts';
import { getUserAgent } from '../../api.ts';
import { entryScriptPath } from '../../node-compat/runtime-info.ts';
import { isUnicode } from '../../tui/symbols.ts';

export interface ForkDeployOptions {
	projectDir: string;
	apiClient: APIClient;
	logger: Logger;
	sdkKey: string;
	deployment: Deployment;
	args: string[];
}

export interface ForkDeployResult {
	success: boolean;
	exitCode: number;
	diagnostics?: ClientDiagnostics;
	/** Deploy result passed back from child process via temp file */
	deployResult?: {
		urls?: {
			deployment: string;
			latest: string;
			custom?: string[];
			dashboard: string;
		};
		logs?: string[];
	};
}

/**
 * Stream data to a Pulse stream URL.
 * Accepts a string, Blob/BunFile, or ReadableStream as the body to avoid
 * loading large outputs into memory.
 */
/**
 * A reference to a file that should be streamed to Pulse without
 * buffering its contents in memory.
 */
interface FileRef {
	path: string;
	size: number;
}

function fileRef(path: string): FileRef {
	return { path, size: statSync(path).size };
}

async function streamToPulse(
	streamURL: string,
	sdkKey: string,
	data: string | Blob | ReadableStream<Uint8Array> | FileRef,
	logger: Logger
): Promise<void> {
	try {
		// FileRef -> stream from disk to avoid loading large log files into
		// memory. fetch() needs a Web ReadableStream (or string/Blob);
		// Readable.toWeb gives us that for a Node createReadStream.
		let body: string | Blob | ReadableStream<Uint8Array>;
		let contentLength: string | undefined;
		if (typeof data === 'object' && data !== null && 'path' in data) {
			body = Readable.toWeb(
				createReadStream(data.path)
			) as unknown as NodeWebReadableStream<Uint8Array> as ReadableStream<Uint8Array>;
			contentLength = String(data.size);
		} else {
			body = data;
		}
		const response = await fetch(streamURL, {
			method: 'PUT',
			headers: {
				'Content-Type': 'text/plain',
				Authorization: `Bearer ${sdkKey}`,
				'User-Agent': getUserAgent(),
				...(contentLength ? { 'Content-Length': contentLength } : {}),
			},
			body,
			// Node 24 requires explicit duplex: 'half' for streamed bodies.
			...(contentLength ? ({ duplex: 'half' } as { duplex: 'half' }) : {}),
		});

		if (!response.ok) {
			logger.error('Failed to stream to Pulse: %s', response.status);
		}
	} catch (err) {
		logger.error('Error streaming to Pulse: %s', err);
	}
}

/**
 * Run the deploy command as a forked child process
 */
export async function runForkedDeploy(options: ForkDeployOptions): Promise<ForkDeployResult> {
	const { projectDir, apiClient, logger, sdkKey, deployment, args } = options;

	const deploymentId = deployment.id;
	const buildLogsStreamURL = deployment.buildLogsStreamURL;
	const reportFile = join(tmpdir(), `agentuity-deploy-${deploymentId}.json`);
	const cleanLogsFile = join(tmpdir(), `agentuity-deploy-${deploymentId}-logs.txt`);
	const rawLogsFile = join(tmpdir(), `agentuity-deploy-${deploymentId}-raw.txt`);
	const deployResultFile = join(tmpdir(), `agentuity-deploy-${deploymentId}-result.json`);
	const rawLogsWriter = createWriteStream(rawLogsFile);
	let proc: ChildProcess | null = null;
	let cancelled = false;

	// Signal handler to forward signals to child process and report cancellation
	const handleSignal = async (signal: NodeJS.Signals) => {
		if (cancelled) return;
		cancelled = true;

		logger.debug('Received %s, forwarding to child process', signal);

		// Kill the child process if it's still running
		if (proc && proc.exitCode === null) {
			try {
				proc.kill(signal);
			} catch (err) {
				logger.debug('Failed to kill child process: %s', err);
			}
		}

		// Report deployment as cancelled (with timeout to ensure prompt exit)
		const cancelMessage = 'Deployment cancelled by user';
		const timeoutMs = 3000; // 3 second timeout
		const timeoutPromise = new Promise<void>((resolve) => {
			setTimeout(() => {
				logger.debug('API call to report cancellation timed out after %dms', timeoutMs);
				resolve();
			}, timeoutMs);
		});

		const apiCallPromise = projectDeploymentFail(apiClient, deploymentId, {
			error: cancelMessage,
			diagnostics: {
				success: false,
				errors: [
					{
						type: 'general',
						scope: 'deploy',
						message: cancelMessage,
						code: 'DEPLOY_CANCELLED',
					},
				],
				warnings: [],
				diagnostics: [],
				error: cancelMessage,
			},
		}).catch((err) => {
			logger.debug('Failed to report cancellation: %s', err);
		});

		// Race API call against timeout to ensure prompt exit
		await Promise.race([apiCallPromise, timeoutPromise]);

		// Exit with signal-specific exit code
		const signalExitCodes: Record<string, number> = {
			SIGINT: 130, // 128 + 2
			SIGTERM: 143, // 128 + 15
			SIGHUP: 129, // 128 + 1
			SIGQUIT: 131, // 128 + 3
		};
		const exitCode = signalExitCodes[signal] ?? 128;
		process.exit(exitCode);
	};

	// Install signal handlers
	const sigintHandler = () => {
		void handleSignal('SIGINT');
	};
	const sigtermHandler = () => {
		void handleSignal('SIGTERM');
	};
	process.on('SIGINT', sigintHandler);
	process.on('SIGTERM', sigtermHandler);

	try {
		const childArgs = ['deploy', '--child-mode', `--report-file=${reportFile}`, ...args];

		// Pass the deployment info via environment variable (same format as CI builds)
		const deploymentEnvValue = JSON.stringify({
			id: deployment.id,
			orgId: deployment.orgId,
			publicKey: deployment.publicKey,
		});

		// Re-exec the same entry point that the parent is running so that
		// local/dev builds test the current code instead of a stale global
		// install. `process.execPath` is the runtime binary (bun or node);
		// `entryScriptPath()` is the script entry (bin/cli.ts under Bun, or
		// dist/cli.js under Node).
		const cmd = [process.execPath, entryScriptPath(), ...childArgs];
		logger.debug('Spawning child deploy process: %s', cmd.join(' '));

		// Get terminal dimensions to pass to child
		const columns = process.stdout.columns || 80;
		const rows = process.stdout.rows || 24;

		proc = spawn(cmd[0]!, cmd.slice(1), {
			cwd: projectDir,
			env: {
				...process.env,
				...getAgentEnv(),
				AGENTUITY_FORK_PARENT: '1',
				AGENTUITY_DEPLOYMENT: deploymentEnvValue,
				// Force color and unicode output since child stdout/stderr are piped (not TTY)
				FORCE_COLOR: '1',
				// Only force unicode if parent terminal supports it
				...(isUnicode ? { FORCE_UNICODE: '1' } : {}),
				// Pass terminal dimensions
				COLUMNS: String(columns),
				LINES: String(rows),
				// Enable clean log collection for Pulse streaming
				AGENTUITY_CLEAN_LOGS_FILE: cleanLogsFile,
				// Pass result file path for child to write deploy URLs/logs back
				AGENTUITY_DEPLOY_RESULT_FILE: deployResultFile,
			},
			stdio: ['inherit', 'pipe', 'pipe'],
		});

		const handleOutput = (stream: Readable, isStderr: boolean) =>
			new Promise<void>((resolve) => {
				const target = isStderr ? process.stderr : process.stdout;
				stream.on('data', (chunk: Buffer | Uint8Array) => {
					// Stream raw bytes to disk instead of accumulating in memory.
					// This prevents OOM / ERR_STRING_TOO_LONG crashes on large builds.
					rawLogsWriter.write(chunk);
					target.write(chunk);
				});
				stream.on('error', (err) => {
					logger.debug('Stream read error: %s', err);
					resolve();
				});
				stream.on('end', () => resolve());
			});

		const stdoutPromise = proc.stdout ? handleOutput(proc.stdout, false) : Promise.resolve();
		const stderrPromise = proc.stderr ? handleOutput(proc.stderr, true) : Promise.resolve();

		await Promise.all([stdoutPromise, stderrPromise]);

		// Close the raw logs writer so the file is fully flushed before reading
		await new Promise<void>((resolve) => {
			rawLogsWriter.end(resolve);
		});

		const exitCode = await new Promise<number>((resolve) => {
			if (proc!.exitCode !== null) {
				resolve(proc!.exitCode);
			} else {
				proc!.once('close', (code) => resolve(code ?? 0));
			}
		});
		logger.debug('Child process exited with code: %d', exitCode);

		let diagnostics: ClientDiagnostics | undefined;

		if (existsSync(reportFile)) {
			try {
				const reportContent = readFileSync(reportFile, 'utf-8');
				diagnostics = JSON.parse(reportContent) as ClientDiagnostics;
				unlinkSync(reportFile);
			} catch (err) {
				logger.debug('Failed to read report file: %s', err);
			}
		}

		// Read deploy result (URLs, logs) from child process
		let deployResult: ForkDeployResult['deployResult'] | undefined;
		if (existsSync(deployResultFile)) {
			try {
				const resultContent = readFileSync(deployResultFile, 'utf-8');
				deployResult = JSON.parse(resultContent);
				unlinkSync(deployResultFile);
			} catch (err) {
				logger.debug('Failed to read deploy result file: %s', err);
			}
		}

		// Stream clean logs to Pulse (prefer clean logs over raw output)
		if (buildLogsStreamURL) {
			let streamedCleanLogs = false;
			if (existsSync(cleanLogsFile)) {
				try {
					const cleanLogs = fileRef(cleanLogsFile);
					if (cleanLogs.size > 0) {
						await streamToPulse(buildLogsStreamURL, sdkKey, cleanLogs, logger);
						streamedCleanLogs = true;
					}
					unlinkSync(cleanLogsFile);
				} catch (err) {
					logger.debug('Failed to stream clean logs file: %s', err);
				}
			}
			if (!streamedCleanLogs && existsSync(rawLogsFile)) {
				// Stream raw logs file directly to Pulse without loading into memory
				await streamToPulse(buildLogsStreamURL, sdkKey, fileRef(rawLogsFile), logger);
			}
		}

		if (exitCode !== 0) {
			const errorMessage = `Deploy process exited with code ${exitCode}`;

			if (!diagnostics) {
				diagnostics = {
					success: false,
					errors: [
						{
							type: 'general',
							scope: 'deploy',
							message: errorMessage,
							code: 'DEPLOY_CRASH',
						},
					],
					warnings: [],
					diagnostics: [],
					error: errorMessage,
				};
			} else if (!diagnostics.error) {
				diagnostics.error = errorMessage;
			}

			try {
				await projectDeploymentFail(apiClient, deploymentId, {
					error: errorMessage,
					diagnostics,
				});
			} catch (err) {
				logger.error('Failed to report deployment failure: %s', err);
			}

			return { success: false, exitCode, diagnostics };
		}

		return { success: true, exitCode, diagnostics, deployResult };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Fork deploy error: %s', errorMessage);

		if (buildLogsStreamURL) {
			let streamedCleanLogs = false;
			if (existsSync(cleanLogsFile)) {
				try {
					const cleanLogs = fileRef(cleanLogsFile);
					if (cleanLogs.size > 0) {
						await streamToPulse(buildLogsStreamURL, sdkKey, cleanLogs, logger);
						streamedCleanLogs = true;
					}
					unlinkSync(cleanLogsFile);
				} catch {
					// ignore
				}
			}
			if (streamedCleanLogs) {
				await streamToPulse(
					buildLogsStreamURL,
					sdkKey,
					`\n\n--- FORK ERROR ---\n${errorMessage}\n`,
					logger
				);
			} else {
				// Append error to raw logs file and stream it without loading into memory
				try {
					appendFileSync(rawLogsFile, `\n\n--- FORK ERROR ---\n${errorMessage}\n`);
				} catch {
					// ignore — file may not exist if child never produced output
				}
				if (existsSync(rawLogsFile)) {
					await streamToPulse(buildLogsStreamURL, sdkKey, fileRef(rawLogsFile), logger);
				} else {
					await streamToPulse(
						buildLogsStreamURL,
						sdkKey,
						`--- FORK ERROR ---\n${errorMessage}\n`,
						logger
					);
				}
			}
		}

		try {
			await projectDeploymentFail(apiClient, deploymentId, {
				error: errorMessage,
				diagnostics: {
					success: false,
					errors: [
						{
							type: 'general',
							scope: 'deploy',
							message: errorMessage,
							code: 'DEPLOY_FORK_ERROR',
						},
					],
					warnings: [],
					diagnostics: [],
					error: errorMessage,
				},
			});
		} catch (failErr) {
			logger.error('Failed to report deployment failure: %s', failErr);
		}

		return {
			success: false,
			exitCode: 1,
			diagnostics: {
				success: false,
				errors: [
					{
						type: 'general',
						scope: 'deploy',
						message: errorMessage,
						code: 'DEPLOY_FORK_ERROR',
					},
				],
				warnings: [],
				diagnostics: [],
				error: errorMessage,
			},
		};
	} finally {
		// Clean up signal handlers
		process.off('SIGINT', sigintHandler);
		process.off('SIGTERM', sigtermHandler);

		// Clean up temp files
		for (const file of [reportFile, cleanLogsFile, rawLogsFile, deployResultFile]) {
			if (existsSync(file)) {
				try {
					unlinkSync(file);
				} catch {
					// ignore
				}
			}
		}
	}
}
