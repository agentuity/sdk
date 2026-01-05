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

import { spawn, type Subprocess } from 'bun';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import type { APIClient } from '../../api';
import { getUserAgent } from '../../api';
import { isUnicode } from '../../tui/symbols';
import { projectDeploymentFail, type ClientDiagnostics, type Deployment } from '@agentuity/server';
import type { Logger } from '@agentuity/core';

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
}

/**
 * Stream data to a Pulse stream URL
 */
async function streamToPulse(
	streamURL: string,
	sdkKey: string,
	data: string
): Promise<void> {
	try {
		const response = await fetch(streamURL, {
			method: 'PUT',
			headers: {
				'Content-Type': 'text/plain',
				Authorization: `Bearer ${sdkKey}`,
				'User-Agent': getUserAgent(),
			},
			body: data,
		});

		if (!response.ok) {
			console.error(`Failed to stream to Pulse: ${response.status}`);
		}
	} catch (err) {
		console.error(`Error streaming to Pulse: ${err}`);
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
	let outputBuffer = '';
	let proc: Subprocess | null = null;

	try {
		const childArgs = [
			'agentuity',
			'deploy',
			'--child-mode',
			`--report-file=${reportFile}`,
			...args,
		];

		// Pass the deployment info via environment variable (same format as CI builds)
		const deploymentEnvValue = JSON.stringify({
			id: deployment.id,
			orgId: deployment.orgId,
			publicKey: deployment.publicKey,
		});

		logger.debug('Spawning child deploy process: bunx %s', childArgs.join(' '));

		// Get terminal dimensions to pass to child
		const columns = process.stdout.columns || 80;
		const rows = process.stdout.rows || 24;

		proc = spawn({
			cmd: ['bunx', ...childArgs],
			cwd: projectDir,
			env: {
				...process.env,
				AGENTUITY_FORK_PARENT: '1',
				AGENTUITY_DEPLOYMENT: deploymentEnvValue,
				// Force color and unicode output since child stdout/stderr are piped (not TTY)
				FORCE_COLOR: '1',
				// Only force unicode if parent terminal supports it
				...(isUnicode ? { FORCE_UNICODE: '1' } : {}),
				// Pass terminal dimensions
				COLUMNS: String(columns),
				LINES: String(rows),
			},
			stdin: 'inherit',
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const handleOutput = async (stream: ReadableStream<Uint8Array>, isStderr: boolean) => {
			const reader = stream.getReader();
			const decoder = new TextDecoder();
			const target = isStderr ? process.stderr : process.stdout;

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const text = decoder.decode(value, { stream: true });
					outputBuffer += text;
					target.write(value);
				}
			} catch (err) {
				logger.debug('Stream read error: %s', err);
			}
		};

		const stdoutPromise =
			proc.stdout && typeof proc.stdout !== 'number'
				? handleOutput(proc.stdout, false)
				: Promise.resolve();
		const stderrPromise =
			proc.stderr && typeof proc.stderr !== 'number'
				? handleOutput(proc.stderr, true)
				: Promise.resolve();

		await Promise.all([stdoutPromise, stderrPromise]);

		const exitCode = await proc.exited;
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

		if (buildLogsStreamURL && outputBuffer) {
			await streamToPulse(buildLogsStreamURL, sdkKey, outputBuffer);
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

		return { success: true, exitCode, diagnostics };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Fork deploy error: %s', errorMessage);

		if (buildLogsStreamURL && outputBuffer) {
			outputBuffer += `\n\n--- FORK ERROR ---\n${errorMessage}\n`;
			await streamToPulse(buildLogsStreamURL, sdkKey, outputBuffer);
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
				errors: [{ type: 'general', scope: 'deploy', message: errorMessage }],
				warnings: [],
				diagnostics: [],
				error: errorMessage,
			},
		};
	} finally {
		if (existsSync(reportFile)) {
			try {
				unlinkSync(reportFile);
			} catch {
				// ignore
			}
		}
	}
}
