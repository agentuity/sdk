import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from '@agentuity/core';
import { writeAndDrain } from '@agentuity/server';
import {
	projectDeploymentGet,
	projectDeploymentLogs,
	projectDeploymentStatus,
	type DeploymentLog,
} from '@agentuity/server';
import type { APIClient } from '../../../api.ts';
import { getUserAgent } from '../../../api.ts';
import { loadProjectSDKKey } from '../../../config.ts';
import type { Config } from '../../../types.ts';
import * as tui from '../../../tui.ts';

const TERMINAL_STATES = new Set(['completed', 'failed']);

export function parseDurationMs(duration: string): number {
	const match = duration.match(/^(\d+)([smhdw])$/);
	if (!match) {
		throw new Error(`Invalid duration "${duration}". Use e.g. 30s, 10m, 1h`);
	}
	const value = Number(match[1]);
	const units: Record<string, number> = {
		s: 1000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
		w: 604_800_000,
	};
	const unitMs = units[match[2]!];
	if (!unitMs) {
		throw new Error(`Invalid duration unit in "${duration}"`);
	}
	return value * unitMs;
}

export interface FollowDeploymentLogsParams {
	apiClient: APIClient;
	projectId: string;
	deploymentId: string;
	config: Config | null | undefined;
	logger: Logger;
	sinceMs?: number;
	timeoutMs?: number;
	pollIntervalMs?: number;
	json?: boolean;
	showTimestamps?: boolean;
	writable?: NodeJS.WritableStream;
	abortSignal?: AbortSignal;
	projectDir?: string;
}

export interface FollowDeploymentLogsResult {
	deploymentId: string;
	projectId: string;
	logs: DeploymentLog[];
	timedOut: boolean;
	state?: string;
	bytesRead: number;
}

function logTimestampMs(timestamp: string): number {
	return Date.parse(timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`);
}

async function writeLine(writable: NodeJS.WritableStream, line: string): Promise<void> {
	await writeAndDrain(writable, Buffer.from(`${line}\n`));
}

async function emitLog(
	writable: NodeJS.WritableStream,
	log: DeploymentLog,
	json: boolean,
	showTimestamps: boolean
): Promise<void> {
	if (json) {
		await writeLine(
			writable,
			JSON.stringify({
				type: 'log',
				timestamp: log.timestamp,
				severity: log.severity,
				body: log.body,
				spanId: log.spanId,
				traceId: log.traceId,
				serviceName: log.serviceName,
			})
		);
		return;
	}

	const severityColor = tui.getSeverityColor(log.severity);
	if (showTimestamps) {
		const timestamp = new Date(log.timestamp).toLocaleString();
		await writeLine(
			writable,
			`${tui.muted(timestamp)} ${severityColor(log.severity.padEnd(5))} ${log.body}`
		);
		return;
	}
	await writeLine(writable, `${severityColor(log.severity.padEnd(5))} ${log.body}`);
}

async function followViaStream(
	streamUrl: string,
	sdkKey: string,
	params: FollowDeploymentLogsParams
): Promise<FollowDeploymentLogsResult> {
	const {
		apiClient,
		projectId,
		deploymentId,
		logger,
		timeoutMs,
		json = false,
		showTimestamps = true,
		writable = process.stdout,
		abortSignal,
		sinceMs,
	} = params;

	const signals: AbortSignal[] = [];
	if (abortSignal) {
		signals.push(abortSignal);
	}
	if (timeoutMs !== undefined) {
		signals.push(AbortSignal.timeout(timeoutMs));
	}
	const combinedSignal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

	const fetchUrl = new URL(streamUrl);
	fetchUrl.searchParams.set('v', '2');
	fetchUrl.searchParams.set('follow', 'true');

	const resp = await fetch(fetchUrl.href, {
		signal: combinedSignal,
		headers: {
			Authorization: `Bearer ${sdkKey}`,
			'User-Agent': getUserAgent(),
		},
	});
	if (!resp.ok || !resp.body) {
		throw new Error(`Failed to open deployment log stream: ${resp.status}`);
	}

	const collected: DeploymentLog[] = [];
	let bytesRead = 0;
	const reader = resp.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		bytesRead += value.length;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const rawLine of lines) {
			const message = rawLine.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/, '');
			if (!message) {
				continue;
			}
			const timestamp = new Date().toISOString();
			if (sinceMs !== undefined && Date.parse(timestamp) <= sinceMs) {
				continue;
			}
			const entry: DeploymentLog = {
				body: message,
				severity: 'INFO',
				timestamp,
				spanId: '',
				traceId: '',
				serviceName: 'deployment',
			};
			collected.push(entry);
			await emitLog(writable, entry, json, showTimestamps);
		}
	}

	let state: string | undefined;
	try {
		const status = await projectDeploymentStatus(apiClient, deploymentId, combinedSignal);
		state = status.state;
	} catch (error) {
		logger.trace('Failed to fetch deployment status after stream follow: %s', error);
	}

	return {
		deploymentId,
		projectId,
		logs: collected,
		timedOut: combinedSignal?.aborted === true && !TERMINAL_STATES.has(state ?? ''),
		state,
		bytesRead,
	};
}

async function followViaPolling(
	params: FollowDeploymentLogsParams
): Promise<FollowDeploymentLogsResult> {
	const {
		apiClient,
		projectId,
		deploymentId,
		sinceMs,
		timeoutMs,
		pollIntervalMs = 2000,
		json = false,
		showTimestamps = true,
		writable = process.stdout,
		abortSignal,
	} = params;

	const startedAt = Date.now();
	const collected: DeploymentLog[] = [];
	let lastTimestampMs = sinceMs ?? 0;
	let state: string | undefined;
	let timedOut = false;
	let bytesRead = 0;

	while (true) {
		if (abortSignal?.aborted) {
			break;
		}
		if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
			timedOut = true;
			break;
		}

		const batch = await projectDeploymentLogs(apiClient, projectId, deploymentId, 200);
		for (const log of batch) {
			const ts = logTimestampMs(log.timestamp);
			if (ts <= lastTimestampMs) {
				continue;
			}
			lastTimestampMs = ts;
			collected.push(log);
			bytesRead += log.body.length;
			await emitLog(writable, log, json, showTimestamps);
		}

		try {
			const status = await projectDeploymentStatus(apiClient, deploymentId, abortSignal);
			state = status.state;
			if (TERMINAL_STATES.has(state)) {
				break;
			}
		} catch {
			break;
		}

		await sleep(pollIntervalMs);
	}

	return {
		deploymentId,
		projectId,
		logs: collected,
		timedOut,
		state,
		bytesRead,
	};
}

export async function followDeploymentLogs(
	params: FollowDeploymentLogsParams
): Promise<FollowDeploymentLogsResult> {
	const { apiClient, projectId, deploymentId, logger, projectDir } = params;
	const deployment = await projectDeploymentGet(apiClient, projectId, deploymentId);
	const streamUrl = deployment.deploymentLogsURL ?? undefined;

	if (streamUrl) {
		try {
			const sdkKey = await loadProjectSDKKey(logger, projectDir ?? process.cwd());
			if (sdkKey) {
				return await followViaStream(streamUrl, sdkKey, params);
			}
		} catch (error) {
			logger.trace('Deployment log stream unavailable, falling back to polling: %s', error);
		}
	}

	return followViaPolling(params);
}
