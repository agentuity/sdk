/**
 * Wait phase
 * ----------
 *
 * Polls the server until the freshly-uploaded deployment finishes warming
 * up, streaming build/run logs to the user's terminal while it waits.
 *
 * Two modes:
 *   - With a `streamId` from the Provision phase we open a long-poll log
 *     stream and tee it into a TUI progress logger that keeps the last
 *     few lines visible. Status polling runs in the same callback so we
 *     can abort the log stream as soon as the deployment terminates.
 *   - Without a streamId (older or local backends that don't expose one)
 *     we fall back to a plain spinner and just poll status.
 *
 * The phase is responsible for:
 *   - Reporting cancellation on Ctrl+C via `DeploymentCancelledError`.
 *   - Writing a tail of the captured log to disk on failure so the user
 *     has something to inspect before re-running.
 *   - Surfacing failure with a banner that links to the dashboard.
 *
 * Successful waits return; the caller renders the success banner and the
 * deployment URL section because that part is interleaved with the JSON
 * response shape and is easier to keep in the deploy command itself.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Logger, StructuredError } from '@agentuity/core';
import {
	type Deployment,
	type DeploymentStatusResult,
	getAppBaseURL,
	projectDeploymentStatus,
} from '@agentuity/server';
import type { APIClient } from '../../../api.ts';
import { getUserAgent } from '../../../api.ts';
import type { BuildReportCollector } from '../../../build-report.ts';
import { getDefaultConfigDir, getStreamURL } from '../../../config.ts';
import { ErrorCode } from '../../../errors.ts';
import * as tui from '../../../tui.ts';
import type { Config } from '../../../types.ts';

/**
 * Internal cancellation marker thrown by the wait loop when the user
 * hits Ctrl+C. Re-exported so the deploy command can identify it in
 * outer try/catches without keeping its own copy.
 */
export const DeploymentCancelledError = StructuredError(
	'DeploymentCancelled',
	'Deployment cancelled by user'
);

export interface WaitParams {
	apiClient: APIClient;
	deployment: Deployment;
	complete: { streamId?: string } | undefined;
	collector: BuildReportCollector;
	hasReportFile: boolean;
	logger: Logger;
	config: Config | null | undefined;
	region: string;
	sdkKey: string;
	/**
	 * Aborted on Ctrl+C; both the log stream and the status poll observe
	 * this signal so cancellation is responsive even mid-fetch.
	 */
	abortSignal: AbortSignal;
	/**
	 * Captured log lines. Mutated in-place because the deploy command
	 * also writes them to its result file and JSON response.
	 */
	logs: string[];
}

/**
 * Run the wait loop. On success: returns once the deployment reports
 * `state === 'completed'`. On failure: writes diagnostics, renders the
 * failure banner via `tui.fatal`, and exits the process.
 */
export async function runWaitForDeployment(params: WaitParams): Promise<void> {
	const {
		apiClient,
		deployment,
		complete,
		collector,
		hasReportFile,
		logger,
		config,
		region,
		sdkKey,
		abortSignal,
		logs,
	} = params;

	const streamId = complete?.streamId;
	const appUrl = getAppBaseURL(process.env.AGENTUITY_REGION ?? config?.name, config?.overrides);
	const dashboard = `${appUrl}/r/${deployment.id}`;

	const endDeploymentWaitDiagnostic = collector.startDiagnostic('deployment-wait');
	const pollInterval = 500;
	const maxAttempts = 600;
	let attempts = 0;
	let statusResult: DeploymentStatusResult | undefined;

	try {
		if (streamId) {
			// Live-log mode. The progress logger keeps the last `maxLines`
			// log entries visible while the spinner runs; we feed it via
			// the `log` callback below.
			const streamsUrl = getStreamURL(region, config ?? null);

			await tui
				.progress({
					message: 'Deploying project...',
					type: 'logger',
					maxLines: 2,
					clearOnSuccess: true,
					callback: async (log) => {
						const logStreamController = new AbortController();
						const logStreamPromise = (async () => {
							try {
								logger.debug('fetching stream: %s/%s', streamsUrl, streamId);
								const resp = await fetch(`${streamsUrl}/${streamId}`, {
									signal: logStreamController.signal,
									headers: {
										Authorization: `Bearer ${sdkKey}`,
										'User-Agent': getUserAgent(),
									},
								});
								if (!resp.ok || !resp.body) {
									logger.trace(`Failed to connect to warmup log stream: ${resp.status}`);
									return;
								}
								const reader = resp.body.getReader();
								const decoder = new TextDecoder();
								let buffer = '';
								while (true) {
									const { done, value } = await reader.read();
									if (done) break;
									buffer += decoder.decode(value, { stream: true });
									const lines = buffer.split('\n');
									buffer = lines.pop() || ''; // keep the partial line
									for (const line of lines) {
										// Strip ISO 8601 timestamp prefix when present
										// so the in-terminal logger shows just the message.
										const message = line.replace(
											/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/,
											''
										);
										if (message) {
											logs.push(message);
											log(message);
										}
									}
								}
							} catch (err) {
								if (err instanceof Error && err.name === 'AbortError') {
									return;
								}
								logger.trace(`Warmup log stream error: ${err}`);
							}
						})();

						// Status polling lives in the same callback so we can
						// observe Ctrl+C and tear down the log stream as soon
						// as the deployment terminates.
						while (attempts < maxAttempts) {
							if (abortSignal.aborted) {
								logStreamController.abort();
								throw new DeploymentCancelledError();
							}

							attempts++;
							try {
								statusResult = await projectDeploymentStatus(
									apiClient,
									deployment.id,
									abortSignal
								);

								logger.trace('status result: %s', statusResult);

								if (statusResult.state === 'completed') {
									logStreamController.abort();
									break;
								}

								if (statusResult.state === 'failed') {
									throw new Error('Deployment failed');
								}

								await sleep(pollInterval);
							} catch (err) {
								logStreamController.abort();
								throw err;
							}
						}

						await logStreamPromise;

						if (attempts >= maxAttempts) {
							throw new Error('Deployment timed out');
						}
					},
				})
				.then(() => {
					endDeploymentWaitDiagnostic();
					tui.success('Your project was deployed!');
				})
				.catch(async (ex) => {
					endDeploymentWaitDiagnostic();
					if (ex instanceof DeploymentCancelledError) {
						if (hasReportFile) {
							await collector.forceWrite();
						}
						tui.warning('Deployment cancelled');
						process.exit(130); // standard SIGINT exit code
					}
					const exwithmessage = ex as { message: string };
					const msg =
						exwithmessage.message === 'Deployment failed' ? '' : exwithmessage.toString();

					const isTimeout = exwithmessage.message === 'Deployment timed out';
					collector.addGeneralError(
						'deploy',
						msg || 'Deployment failed',
						isTimeout ? 'DEPLOY003' : 'DEPLOY004'
					);
					if (hasReportFile) {
						await collector.forceWrite();
					}

					tui.error(`Your deployment failed to start${msg ? `: ${msg}` : ''}`);
					if (logs.length) {
						const logsDir = join(getDefaultConfigDir(), 'logs');
						if (!existsSync(logsDir)) {
							mkdirSync(logsDir, { recursive: true });
						}
						const errorFile = join(logsDir, `${deployment.id}.txt`);
						writeFileSync(errorFile, logs.join('\n'));
						const count = Math.min(logs.length, 10);
						const last = logs.length - count;
						tui.newline();
						tui.warning(`The last ${count} lines of the log:`);
						let offset = last + 1; // 1-indexed offset into the captured log
						const max = String(logs.length).length;
						for (const _log of logs.slice(last)) {
							console.log(tui.muted(`${offset.toFixed().padEnd(max)} | ${_log}`));
							offset++;
						}
						tui.newline();
						tui.fatal(`The logs were written to ${errorFile}`, ErrorCode.BUILD_FAILED);
					}
					tui.fatal('Deployment failed', ErrorCode.BUILD_FAILED);
				});
		} else {
			// Plain spinner mode for backends that don't surface a live
			// log stream id. Just poll status until terminal.
			await tui.spinner({
				message: 'Deploying project...',
				type: 'simple',
				clearOnSuccess: true,
				callback: async () => {
					while (attempts < maxAttempts) {
						if (abortSignal.aborted) {
							throw new DeploymentCancelledError();
						}

						attempts++;
						statusResult = await projectDeploymentStatus(
							apiClient,
							deployment.id,
							abortSignal
						);

						if (statusResult.state === 'completed') {
							break;
						}
						if (statusResult.state === 'failed') {
							throw new Error('Deployment failed');
						}

						await sleep(pollInterval);
					}

					if (attempts >= maxAttempts) {
						throw new Error('Deployment timed out');
					}
				},
			});

			endDeploymentWaitDiagnostic();
			tui.success('Your project was deployed!');
		}
	} catch (ex) {
		endDeploymentWaitDiagnostic();
		const exwithmessage = ex as { message: string };
		const isTimeout = exwithmessage?.message === 'Deployment timed out';
		collector.addGeneralError(
			'deploy',
			exwithmessage?.message || String(ex),
			isTimeout ? 'DEPLOY003' : 'DEPLOY004'
		);
		if (hasReportFile) {
			await collector.forceWrite();
		}

		const lines = [`${ex}`, ''];
		lines.push(
			`${tui.ICONS.arrow} ${tui.bold(tui.padRight('Dashboard:', 12)) + tui.link(dashboard)}`
		);
		tui.banner(tui.colorError(`Deployment: ${deployment.id} Failed`), lines.join('\n'), {
			centerTitle: false,
			topSpacer: false,
			bottomSpacer: false,
		});
		tui.fatal('Deployment failed', ErrorCode.BUILD_FAILED);
	}
}
