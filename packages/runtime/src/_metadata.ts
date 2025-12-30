/**
 * Build metadata utilities
 * Provides cached access to agentuity.metadata.json
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { internal } from './logger/internal';

export interface BuildMetadataAgent {
	filename: string;
	id: string;
	agentId: string;
	version: string;
	name: string;
	description?: string;
	projectId?: string;
	schema?: {
		input?: string;
		output?: string;
	};
	evals?: Array<{
		filename: string;
		id: string;
		evalId: string;
		name: string;
		version: string;
		description?: string;
		agentIdentifier?: string;
		projectId?: string;
	}>;
}

export interface BuildMetadataRoute {
	id: string;
	filename: string;
	path: string;
	method: 'get' | 'post' | 'put' | 'delete' | 'patch';
	version: string;
	type?: string;
	agentIds?: string[];
	config?: Record<string, unknown>;
	schema?: {
		input?: string;
		output?: string;
	};
}

export interface BuildMetadata {
	routes: BuildMetadataRoute[];
	agents: BuildMetadataAgent[];
	assets?: string[];
	project: {
		id: string;
		name: string;
		version?: string;
		description?: string;
		keywords?: string[];
		orgId?: string;
	};
	deployment: {
		id: string;
		date: string;
		build: {
			bun: string;
			agentuity: string;
			arch: string;
			platform: string;
		};
		git?: {
			branch?: string;
			repo?: string;
			provider?: string;
			tags?: string[];
			commit?: string;
			message?: string;
		};
	};
}

// Cached metadata - null means not yet loaded, undefined means file not found
let _metadataCache: BuildMetadata | null | undefined = null;

/**
 * Get the path to agentuity.metadata.json
 *
 * Checks multiple locations to support both dev and production:
 * - Production: cwd is .agentuity/, file is at cwd/agentuity.metadata.json
 * - Dev: cwd is project root, file is at cwd/.agentuity/agentuity.metadata.json
 */
export function getMetadataPath(): string {
	// Production path: running from .agentuity/ directory
	const productionPath = join(process.cwd(), 'agentuity.metadata.json');
	if (existsSync(productionPath)) {
		return productionPath;
	}

	// Dev path: running from project root
	const devPath = join(process.cwd(), '.agentuity', 'agentuity.metadata.json');
	if (existsSync(devPath)) {
		return devPath;
	}

	// Default to production path (will fail gracefully in loadBuildMetadata)
	return productionPath;
}

/**
 * Load and cache the build metadata from agentuity.metadata.json
 * Returns undefined if the file doesn't exist or can't be parsed
 */
export function loadBuildMetadata(): BuildMetadata | undefined {
	// Return cached value if already loaded
	if (_metadataCache !== null) {
		internal.info(
			'[metadata] loadBuildMetadata: returning cached value (exists: %s)',
			_metadataCache !== undefined
		);
		return _metadataCache;
	}

	const metadataPath = getMetadataPath();
	internal.info('[metadata] loadBuildMetadata: checking path %s', metadataPath);
	internal.info('[metadata] loadBuildMetadata: cwd=%s', process.cwd());

	if (!existsSync(metadataPath)) {
		internal.info('[metadata] agentuity.metadata.json not found at %s', metadataPath);
		_metadataCache = undefined;
		return undefined;
	}

	try {
		internal.info('[metadata] loadBuildMetadata: file exists, reading...');
		const content = readFileSync(metadataPath, 'utf-8');
		const metadata = JSON.parse(content) as BuildMetadata;
		_metadataCache = metadata;

		// Log agent and eval counts
		let totalEvals = 0;
		for (const agent of metadata.agents ?? []) {
			totalEvals += agent.evals?.length ?? 0;
		}

		internal.info(
			'[metadata] loaded agentuity.metadata.json: %d agents, %d routes, %d total evals',
			metadata.agents?.length ?? 0,
			metadata.routes?.length ?? 0,
			totalEvals
		);

		// Log agent names and their eval counts
		for (const agent of metadata.agents ?? []) {
			internal.info('[metadata]   agent: %s (evals: %d)', agent.name, agent.evals?.length ?? 0);
		}

		return metadata;
	} catch (err) {
		internal.info('[metadata] failed to load agentuity.metadata.json: %s', err);
		_metadataCache = undefined;
		return undefined;
	}
}

// Eval metadata type (extracted from agent's evals array)
export type BuildMetadataEval = NonNullable<BuildMetadataAgent['evals']>[number];

// Agent lookup cache - built lazily from metadata
let _agentsByName: Map<string, BuildMetadataAgent> | null = null;
let _agentsByAgentId: Map<string, BuildMetadataAgent> | null = null;

// Eval lookup cache - nested map: agentName -> evalName -> evalMetadata
let _evalsByAgentName: Map<string, Map<string, BuildMetadataEval>> | null = null;
let _evalsByAgentId: Map<string, Map<string, BuildMetadataEval>> | null = null;

// Track if we've already attempted a reload for empty eval map
let _evalReloadAttempted = false;

// Track if we've already attempted a reload for empty agent map
let _agentReloadAttempted = false;

/**
 * Build agent lookup maps from metadata
 */
function ensureAgentMaps(): void {
	if (_agentsByName !== null) {
		internal.info(`[metadata] ensureAgentMaps: already initialized, skipping`);
		return;
	}

	internal.info(`[metadata] ensureAgentMaps: initializing agent and eval maps`);

	_agentsByName = new Map();
	_agentsByAgentId = new Map();
	_evalsByAgentName = new Map();
	_evalsByAgentId = new Map();

	const metadata = loadBuildMetadata();
	if (!metadata?.agents) {
		internal.info(`[metadata] ensureAgentMaps: no metadata or no agents found`);
		return;
	}

	internal.info(`[metadata] ensureAgentMaps: processing ${metadata.agents.length} agents`);

	for (const agent of metadata.agents) {
		if (agent.name) {
			_agentsByName.set(agent.name, agent);
		}
		if (agent.agentId) {
			_agentsByAgentId.set(agent.agentId, agent);
		}

		// Build eval lookup maps
		if (agent.evals && agent.evals.length > 0) {
			const evalsByName = new Map<string, BuildMetadataEval>();
			for (const evalMeta of agent.evals) {
				if (evalMeta.name) {
					evalsByName.set(evalMeta.name, evalMeta);
					internal.info(
						`[metadata] Indexed eval: agent='${agent.name}' eval='${evalMeta.name}' evalId='${evalMeta.evalId}'`
					);
				}
			}
			if (agent.name) {
				_evalsByAgentName.set(agent.name, evalsByName);
			}
			if (agent.agentId) {
				_evalsByAgentId.set(agent.agentId, evalsByName);
			}
		} else {
			internal.info(`[metadata] Agent '${agent.name}' has no evals`);
		}
	}
	internal.info(`[metadata] Eval maps built: ${_evalsByAgentName?.size ?? 0} agents with evals`);
}

/**
 * Look up agent metadata by name
 */
export function getAgentMetadataByName(agentName: string): BuildMetadataAgent | undefined {
	ensureAgentMaps();

	// If agent map is empty, the cache may have been built before metadata was ready
	// Try clearing and reloading once (only attempt once to avoid repeated reloads)
	// This mirrors the reload logic in getEvalMetadata
	if (_agentsByName?.size === 0 && !_agentReloadAttempted) {
		_agentReloadAttempted = true;
		internal.info(
			`[metadata] getAgentMetadataByName: agent map is empty, attempting cache clear and reload`
		);
		clearMetadataCache();
		ensureAgentMaps();
		internal.info(
			`[metadata] getAgentMetadataByName: after reload, agent map size: ${_agentsByName?.size ?? 0}`
		);
	}

	return _agentsByName?.get(agentName);
}

/**
 * Look up agent metadata by agentId
 */
export function getAgentMetadataByAgentId(agentId: string): BuildMetadataAgent | undefined {
	ensureAgentMaps();
	return _agentsByAgentId?.get(agentId);
}

/**
 * Look up eval metadata by agent name and eval name
 */
export function getEvalMetadata(
	agentName: string,
	evalName: string
): BuildMetadataEval | undefined {
	ensureAgentMaps();

	// If eval map is empty, the cache may have been built before metadata was ready
	// Try clearing and reloading once (only attempt once to avoid repeated reloads)
	if (_evalsByAgentName?.size === 0 && !_evalReloadAttempted) {
		_evalReloadAttempted = true;
		internal.info(
			`[metadata] getEvalMetadata: eval map is empty, attempting cache clear and reload`
		);
		clearMetadataCache();
		ensureAgentMaps();
		internal.info(
			`[metadata] getEvalMetadata: after reload, eval map size: ${_evalsByAgentName?.size ?? 0}`
		);
	}

	const agentEvals = _evalsByAgentName?.get(agentName);
	internal.info(
		`[metadata] getEvalMetadata('${agentName}', '${evalName}'): agentEvals=${agentEvals ? `Map(${agentEvals.size})` : 'undefined'}`
	);
	if (agentEvals) {
		internal.info(
			`[metadata] Available evals for agent '${agentName}': [${[...agentEvals.keys()].join(', ')}]`
		);
	}
	if (!agentEvals) {
		internal.info(
			`[metadata] Available agents in eval map: [${[...(_evalsByAgentName?.keys() ?? [])].join(', ')}]`
		);
	}
	const result = agentEvals?.get(evalName);
	internal.info(
		`[metadata] getEvalMetadata result: ${result ? `found evalId=${result.evalId}` : 'not found'}`
	);
	return result;
}

/**
 * Look up eval metadata by agentId and eval name
 */
export function getEvalMetadataByAgentId(
	agentId: string,
	evalName: string
): BuildMetadataEval | undefined {
	ensureAgentMaps();
	return _evalsByAgentId?.get(agentId)?.get(evalName);
}

/**
 * Check if metadata file exists (uses cache)
 */
export function hasMetadata(): boolean {
	return loadBuildMetadata() !== undefined;
}

/**
 * Clear the metadata cache (useful for testing or hot reload)
 */
export function clearMetadataCache(): void {
	internal.info('[metadata] clearMetadataCache: clearing all caches');
	_metadataCache = null;
	_agentsByName = null;
	_agentsByAgentId = null;
	_evalsByAgentName = null;
	_evalsByAgentId = null;
	// Note: _evalReloadAttempted is intentionally NOT reset here
	// to prevent infinite reload loops in getEvalMetadata
}
