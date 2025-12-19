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
 */
export function getMetadataPath(): string {
	return join(process.cwd(), '.agentuity', 'agentuity.metadata.json');
}

/**
 * Load and cache the build metadata from agentuity.metadata.json
 * Returns undefined if the file doesn't exist or can't be parsed
 */
export function loadBuildMetadata(): BuildMetadata | undefined {
	// Return cached value if already loaded
	if (_metadataCache !== null) {
		return _metadataCache;
	}

	const metadataPath = getMetadataPath();

	if (!existsSync(metadataPath)) {
		internal.info('[metadata] agentuity.metadata.json not found at %s', metadataPath);
		_metadataCache = undefined;
		return undefined;
	}

	try {
		const content = readFileSync(metadataPath, 'utf-8');
		const metadata = JSON.parse(content) as BuildMetadata;
		_metadataCache = metadata;
		internal.info(
			'[metadata] loaded agentuity.metadata.json: %d agents, %d routes',
			metadata.agents?.length ?? 0,
			metadata.routes?.length ?? 0
		);
		return metadata;
	} catch (err) {
		internal.info('[metadata] failed to load agentuity.metadata.json: %s', err);
		_metadataCache = undefined;
		return undefined;
	}
}

// Agent lookup cache - built lazily from metadata
let _agentsByName: Map<string, BuildMetadataAgent> | null = null;
let _agentsByAgentId: Map<string, BuildMetadataAgent> | null = null;

/**
 * Build agent lookup maps from metadata
 */
function ensureAgentMaps(): void {
	if (_agentsByName !== null) return;

	_agentsByName = new Map();
	_agentsByAgentId = new Map();

	const metadata = loadBuildMetadata();
	if (!metadata?.agents) return;

	for (const agent of metadata.agents) {
		if (agent.name) {
			_agentsByName.set(agent.name, agent);
		}
		if (agent.agentId) {
			_agentsByAgentId.set(agent.agentId, agent);
		}
	}
}

/**
 * Look up agent metadata by name
 */
export function getAgentMetadataByName(agentName: string): BuildMetadataAgent | undefined {
	ensureAgentMaps();
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
 * Check if metadata file exists (uses cache)
 */
export function hasMetadata(): boolean {
	return loadBuildMetadata() !== undefined;
}

/**
 * Clear the metadata cache (useful for testing or hot reload)
 */
export function clearMetadataCache(): void {
	_metadataCache = null;
	_agentsByName = null;
	_agentsByAgentId = null;
}
