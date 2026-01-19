import { KeyValueStorageService, type Logger } from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import { getDefaultRegion } from '../../../config';
import type { AuthData, Config } from '../../../types';

/** KV namespace for Cadence loop state */
export const CADENCE_NAMESPACE = 'agentuity-opencode-tasks';

/** Prefix for loop state keys */
export const LOOP_KEY_PREFIX = 'loop:';

export interface CadenceLoop {
	loopId: string;
	parentId?: string;
	projectLabel?: string;
	sessionId?: string;
	status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
	iteration: number;
	maxIterations: number;
	prompt: string;
	createdAt: string;
	updatedAt: string;
	lastError?: string;
	sandbox?: {
		mode: 'off' | 'per_iteration' | 'persistent';
		sandboxId?: string;
	};
}

export interface CadenceContext {
	logger: Logger;
	config: Config | null;
	auth: AuthData;
	project?: { region: string };
}

/**
 * Creates a KV storage service for Cadence operations.
 */
export async function createCadenceKVAdapter(ctx: CadenceContext): Promise<KeyValueStorageService> {
	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${ctx.auth.apiKey}`,
			},
		},
		ctx.logger
	);

	const region = ctx.project?.region || (await getDefaultRegion(ctx.config?.name, ctx.config));
	const urls = getServiceUrls(region);
	const baseUrl = urls.catalyst;
	return new KeyValueStorageService(baseUrl, adapter);
}

/**
 * Gets the state key for a loop.
 */
export function getLoopStateKey(loopId: string): string {
	return `${LOOP_KEY_PREFIX}${loopId}:state`;
}

/**
 * Parses a loop state from KV storage.
 */
export function parseLoopState(data: unknown): CadenceLoop | null {
	if (!data || typeof data !== 'object') return null;

	const loop = data as Record<string, unknown>;
	if (!loop.loopId || !loop.status || !loop.prompt) return null;

	return {
		loopId: String(loop.loopId),
		parentId: loop.parentId ? String(loop.parentId) : undefined,
		projectLabel: loop.projectLabel ? String(loop.projectLabel) : undefined,
		sessionId: loop.sessionId ? String(loop.sessionId) : undefined,
		status: loop.status as CadenceLoop['status'],
		iteration: Number(loop.iteration) || 1,
		maxIterations: Number(loop.maxIterations) || 50,
		prompt: String(loop.prompt),
		createdAt: String(loop.createdAt),
		updatedAt: String(loop.updatedAt),
		lastError: loop.lastError ? String(loop.lastError) : undefined,
		sandbox: loop.sandbox as CadenceLoop['sandbox'],
	};
}
