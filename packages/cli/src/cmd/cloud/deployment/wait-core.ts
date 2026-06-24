import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from '@agentuity/core';
import {
	DeploymentStateValue,
	getAppBaseURL,
	projectDeploymentGet,
	projectDeploymentLogs,
	projectDeploymentStatus,
	projectGet,
	type DeploymentState,
} from '@agentuity/server';
import type { APIClient } from '../../../api.ts';
import { getUserAgent } from '../../../api.ts';
import { getStreamURL, loadProjectSDKKey } from '../../../config.ts';
import type { Config } from '../../../types.ts';

const TERMINAL_STATES = new Set<DeploymentState>(['completed', 'failed']);

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

export interface WaitForDeploymentParams {
	apiClient: APIClient;
	projectId: string;
	deploymentId: string;
	config: Config | null | undefined;
	logger: Logger;
	timeoutMs: number;
	pollIntervalMs?: number;
	abortSignal?: AbortSignal;
	includeRecentLogsOnFailure?: boolean;
	recentLogLines?: number;
	projectDir?: string;
}

export interface WaitForDeploymentResult {
	success: boolean;
	timedOut: boolean;
	state: DeploymentState;
	deploymentId: string;
	projectId: string;
	active: boolean;
	urls: {
		dashboard: string;
		app?: string;
		custom?: string[];
	};
	recentLogs?: string[];
	message?: string;
}

async function fetchRecentLogs(
	apiClient: APIClient,
	projectId: string,
	deploymentId: string,
	limit: number
): Promise<string[]> {
	const logs = await projectDeploymentLogs(apiClient, projectId, deploymentId, limit);
	return logs.slice(-limit).map((log) => log.body);
}

async function streamWarmupLogs(
	streamId: string,
	region: string,
	config: Config | null | undefined,
	sdkKey: string,
	logger: Logger,
	abortSignal: AbortSignal,
	onLine: (line: string) => void
): Promise<void> {
	const streamsUrl = getStreamURL(region, config ?? null);
	const resp = await fetch(`${streamsUrl}/${streamId}`, {
		signal: abortSignal,
		headers: {
			Authorization: `Bearer ${sdkKey}`,
			'User-Agent': getUserAgent(),
		},
	});
	if (!resp.ok || !resp.body) {
		logger.trace('Warmup log stream unavailable: %d', resp.status);
		return;
	}

	const reader = resp.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			const message = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/, '');
			if (message) {
				onLine(message);
			}
		}
	}
}

export async function waitForDeployment(
	params: WaitForDeploymentParams
): Promise<WaitForDeploymentResult> {
	const {
		apiClient,
		projectId,
		deploymentId,
		config,
		logger,
		timeoutMs,
		pollIntervalMs = 500,
		abortSignal,
		includeRecentLogsOnFailure = true,
		recentLogLines = 10,
		projectDir,
	} = params;

	const startedAt = Date.now();
	const deployment = await projectDeploymentGet(apiClient, projectId, deploymentId);
	const region =
		deployment.cloudRegion ??
		process.env.AGENTUITY_REGION ??
		(config?.preferences &&
		typeof config.preferences === 'object' &&
		'region' in config.preferences &&
		typeof config.preferences.region === 'string'
			? config.preferences.region
			: 'us-east-1');
	const appBaseUrl = getAppBaseURL(
		typeof region === 'string' ? region : config?.name,
		config?.overrides
	);
	const dashboard = `${appBaseUrl}/r/${deploymentId}`;

	let projectAppUrl: string | undefined;
	try {
		const project = await projectGet(apiClient, { id: projectId, mask: true, keys: false });
		projectAppUrl = project.urls?.app;
	} catch (error) {
		logger.trace('Failed to fetch project URLs during wait: %s', error);
	}

	const recentLogs: string[] = [];
	const streamAbort = new AbortController();
	const combinedSignal = abortSignal
		? AbortSignal.any([abortSignal, streamAbort.signal])
		: streamAbort.signal;

	const streamId = deployment.deploymentLogsURL
		? new URL(deployment.deploymentLogsURL).pathname.split('/').pop()
		: undefined;

	let sdkKey: string | undefined;
	if (streamId) {
		try {
			sdkKey = await loadProjectSDKKey(logger, projectDir ?? process.cwd());
		} catch (error) {
			logger.trace('Skipping warmup log stream; SDK key unavailable: %s', error);
		}
	}

	const streamPromise =
		streamId && sdkKey
			? streamWarmupLogs(streamId, region, config, sdkKey, logger, combinedSignal, (line) => {
					recentLogs.push(line);
					if (recentLogs.length > recentLogLines) {
						recentLogs.shift();
					}
				})
			: Promise.resolve();

	let state: DeploymentState = DeploymentStateValue.parse(deployment.state ?? 'pending');
	let timedOut = false;

	while (Date.now() - startedAt < timeoutMs) {
		if (abortSignal?.aborted) {
			streamAbort.abort();
			break;
		}

		const status = await projectDeploymentStatus(apiClient, deploymentId, combinedSignal);
		state = status.state;

		if (TERMINAL_STATES.has(state)) {
			break;
		}

		await sleep(pollIntervalMs);
	}

	streamAbort.abort();
	await streamPromise.catch(() => undefined);

	if (!TERMINAL_STATES.has(state)) {
		timedOut = true;
	}

	const success = state === 'completed';
	let failureLogs: string[] | undefined;
	if (!success && includeRecentLogsOnFailure) {
		if (recentLogs.length > 0) {
			failureLogs = recentLogs.slice(-recentLogLines);
		} else {
			try {
				failureLogs = await fetchRecentLogs(apiClient, projectId, deploymentId, recentLogLines);
			} catch (error) {
				logger.trace('Failed to fetch recent logs after wait: %s', error);
			}
		}
	}

	return {
		success,
		timedOut,
		state,
		deploymentId,
		projectId,
		active: deployment.active,
		urls: {
			dashboard,
			app: projectAppUrl,
			custom: deployment.customDomains?.map((domain) => `https://${domain}`),
		},
		recentLogs: failureLogs,
		message: timedOut
			? `Deployment did not reach a terminal state within ${timeoutMs}ms`
			: state === 'failed'
				? 'Deployment failed'
				: undefined,
	};
}
