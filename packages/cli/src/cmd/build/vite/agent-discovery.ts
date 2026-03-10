/**
 * Agent Discovery — import-based
 *
 * Discovers agents by scanning src/agent/**\/*.ts files and importing them
 * at build time. The agent instance already knows its own metadata, schemas,
 * and evals — no AST parsing needed.
 */

import { dirname, join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '../../../types';
import { toForwardSlash } from '../../../utils/normalize-path';

export interface AgentMetadata {
	filename: string;
	name: string;
	id: string;
	agentId: string;
	version: string;
	description?: string;
	inputSchemaCode?: string;
	outputSchemaCode?: string;
	evals?: EvalMetadata[];
}

export interface EvalMetadata {
	id: string;
	identifier: string;
	name: string;
	filename: string;
	version: string;
	description?: string;
	agentIdentifier: string;
	projectId: string;
}

/**
 * Hash function for generating stable IDs
 */
function hash(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha256');
	for (const v of val) hasher.update(v);
	return hasher.digest().toHex();
}

function hashSHA1(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha1');
	for (const v of val) hasher.update(v);
	return hasher.digest().toHex();
}

function getAgentId(
	projectId: string,
	deploymentId: string,
	filename: string,
	version: string
): string {
	return `agentid_${hashSHA1(projectId, deploymentId, filename, version)}`;
}

function generateStableAgentId(projectId: string, name: string): string {
	return `agent_${hashSHA1(projectId, name)}`.substring(0, 64);
}

function getEvalId(
	projectId: string,
	deploymentId: string,
	filename: string,
	name: string,
	version: string
): string {
	return `evalid_${hashSHA1(projectId, deploymentId, filename, name, version)}`;
}

function generateStableEvalId(projectId: string, agentId: string, name: string): string {
	return `eval_${hashSHA1(projectId, agentId, name)}`.substring(0, 64);
}

/**
 * Convert a StandardSchemaV1-compatible schema to a JSON Schema string.
 * Dynamically imports toJSONSchema from @agentuity/schema (available in user's project).
 */
async function schemaToJsonString(
	schema: unknown,
	rootDir: string,
	logger: Logger
): Promise<string | undefined> {
	if (!schema) return undefined;

	try {
		// Resolve @agentuity/schema from the user's project
		const schemaModulePath = join(rootDir, 'node_modules', '@agentuity', 'schema');
		if (!existsSync(schemaModulePath)) {
			logger.debug('[agent-discovery] @agentuity/schema not found in user project');
			return undefined;
		}

		const { toJSONSchema } = await import(join(schemaModulePath, 'src', 'json-schema.ts'));
		const jsonSchema = toJSONSchema(schema);
		return JSON.stringify(jsonSchema);
	} catch (error) {
		logger.debug(
			'[agent-discovery] Failed to convert schema to JSON Schema: %s',
			error instanceof Error ? error.message : String(error)
		);
		return undefined;
	}
}

/**
 * Import an agent file and extract metadata from the agent instance.
 */
async function importAgentMetadata(
	filePath: string,
	relativeFilename: string,
	rootDir: string,
	projectId: string,
	deploymentId: string,
	logger: Logger
): Promise<AgentMetadata | null> {
	try {
		const source = await Bun.file(filePath).text();
		const version = hash(source);

		// Quick check — skip files without createAgent
		if (!source.includes('createAgent')) {
			return null;
		}

		// Import the agent file — Bun handles TS natively
		const mod = await import(filePath);
		const agent = mod.default;

		if (!agent?.metadata?.name) {
			logger.debug('[agent-discovery] No valid agent found in %s', relativeFilename);
			return null;
		}

		const name = agent.metadata.name;
		const description = agent.metadata.description;
		const id = getAgentId(projectId, deploymentId, relativeFilename, version);
		const agentId = generateStableAgentId(projectId, name);

		// Extract schemas as JSON Schema strings
		const inputSchemaCode = await schemaToJsonString(agent.inputSchema, rootDir, logger);
		const outputSchemaCode = await schemaToJsonString(agent.outputSchema, rootDir, logger);

		// Extract evals from agent.evals array (self-registered by createEval())
		const evals: EvalMetadata[] = [];
		if (agent.evals && Array.isArray(agent.evals) && agent.evals.length > 0) {
			for (const evalItem of agent.evals) {
				const evalName = evalItem.metadata?.name ?? evalItem.name;
				if (!evalName) continue;

				const evalDescription = evalItem.metadata?.description ?? evalItem.description;
				const evalVersion = version; // same file version
				const evalId = getEvalId(
					projectId,
					deploymentId,
					relativeFilename,
					evalName,
					evalVersion
				);
				const evalIdentifier = generateStableEvalId(projectId, agentId, evalName);

				logger.trace(
					'Found eval "%s" in %s (identifier: %s)',
					evalName,
					relativeFilename,
					evalIdentifier
				);

				evals.push({
					id: evalId,
					identifier: evalIdentifier,
					name: evalName,
					filename: relativeFilename,
					version: evalVersion,
					description: evalDescription,
					agentIdentifier: agentId,
					projectId,
				});
			}
		}

		// Also check for evals in separate eval.ts file in same directory
		const agentDir = dirname(filePath);
		const evalsPath = join(agentDir, 'eval.ts');
		if (existsSync(evalsPath)) {
			const evalsSource = await Bun.file(evalsPath).text();
			if (evalsSource.includes('createEval')) {
				try {
					await import(evalsPath);
					// After importing, the evals self-register on the agent via agent.createEval()
					// Re-check agent.evals for any newly registered evals
					if (agent.evals && Array.isArray(agent.evals)) {
						const relativeEvalsPath = toForwardSlash(relative(join(rootDir), evalsPath));
						const evalVersion = hash(evalsSource);

						for (const evalItem of agent.evals) {
							const evalName = evalItem.metadata?.name ?? evalItem.name;
							if (!evalName) continue;

							// Skip if already collected from agent file
							if (evals.some((e) => e.name === evalName)) continue;

							const evalDescription = evalItem.metadata?.description ?? evalItem.description;
							const evalId = getEvalId(
								projectId,
								deploymentId,
								relativeEvalsPath,
								evalName,
								evalVersion
							);
							const evalIdentifier = generateStableEvalId(projectId, agentId, evalName);

							logger.trace(
								'Found eval "%s" in eval.ts for agent %s (identifier: %s)',
								evalName,
								name,
								evalIdentifier
							);

							evals.push({
								id: evalId,
								identifier: evalIdentifier,
								name: evalName,
								filename: relativeEvalsPath,
								version: evalVersion,
								description: evalDescription,
								agentIdentifier: agentId,
								projectId,
							});
						}
					}
				} catch (error) {
					logger.warn(
						'[agent-discovery] Failed to import evals from %s: %s',
						evalsPath,
						error instanceof Error ? error.message : String(error)
					);
				}
			}
		}

		return {
			filename: relativeFilename,
			name,
			id,
			agentId,
			version,
			description,
			inputSchemaCode,
			outputSchemaCode,
			evals: evals.length > 0 ? evals : undefined,
		};
	} catch (error) {
		logger.warn(
			'[agent-discovery] Failed to import agent %s: %s',
			filePath,
			error instanceof Error ? error.message : String(error)
		);
		return null;
	}
}

/**
 * Discover all agents in src/agent directory.
 *
 * Imports each agent file at build time — the agent instance already knows
 * its own metadata, schemas, and evals. No AST parsing needed.
 */
export async function discoverAgents(
	srcDir: string,
	projectId: string,
	deploymentId: string,
	logger: Logger
): Promise<AgentMetadata[]> {
	const agentsDir = join(srcDir, 'agent');
	const agents: AgentMetadata[] = [];
	const rootDir = join(srcDir, '..');

	if (!existsSync(agentsDir)) {
		logger.trace('No agent directory found at %s', agentsDir);
		return agents;
	}

	// Scan all .ts files in agent directory
	const glob = new Bun.Glob('**/*.ts');
	for await (const file of glob.scan(agentsDir)) {
		const filePath = join(agentsDir, file);

		// Skip eval.ts files (processed as part of agent discovery)
		if (file.endsWith('/eval.ts') || file === 'eval.ts') {
			continue;
		}

		const relativeFilename = toForwardSlash(relative(rootDir, filePath));
		const agentMetadata = await importAgentMetadata(
			filePath,
			relativeFilename,
			rootDir,
			projectId,
			deploymentId,
			logger
		);

		if (agentMetadata) {
			logger.trace('Discovered agent: %s at %s', agentMetadata.name, relativeFilename);
			agents.push(agentMetadata);
		}
	}

	logger.debug('Discovered %d agent(s)', agents.length);
	return agents;
}
