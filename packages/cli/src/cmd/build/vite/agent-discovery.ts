/**
 * Agent Discovery - READ-ONLY AST analysis
 *
 * Discovers agents by scanning src/agent/**\/*.ts files
 * Extracts metadata WITHOUT mutating source files
 */

import * as acornLoose from 'acorn-loose';
import { generate } from 'astring';
import { dirname, join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '../../../types';
import { formatSchemaCode } from '../format-schema';

interface ASTNode {
	type: string;
	start?: number;
	end?: number;
}

interface ASTNodeIdentifier extends ASTNode {
	name: string;
}

interface ASTPropertyNode {
	type: string;
	kind: string;
	key: ASTNodeIdentifier;
	value: ASTNode;
	shorthand?: boolean;
	method?: boolean;
	computed?: boolean;
}

interface ASTObjectExpression extends ASTNode {
	properties: ASTPropertyNode[];
}

interface ASTLiteral extends ASTNode {
	value: string | number | boolean | null;
	raw?: string;
}

interface ASTCallExpression extends ASTNode {
	arguments: unknown[];
	callee: ASTNode;
}

interface ASTVariableDeclarator extends ASTNode {
	id: ASTNode;
	init?: ASTNode;
}

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
	val.forEach((v) => hasher.update(v));
	return hasher.digest().toHex();
}

function hashSHA1(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha1');
	val.forEach((v) => hasher.update(v));
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
 * Extract schema code from createAgent call arguments
 */
function extractSchemaCode(callargexp: ASTObjectExpression): {
	inputSchemaCode?: string;
	outputSchemaCode?: string;
} {
	let schemaObj: ASTObjectExpression | undefined;

	// Find the schema property
	for (const prop of callargexp.properties) {
		if (prop.key.type === 'Identifier' && prop.key.name === 'schema') {
			if (prop.value.type === 'ObjectExpression') {
				schemaObj = prop.value as ASTObjectExpression;
				break;
			}
		}
	}

	if (!schemaObj) {
		return {};
	}

	let inputSchemaCode: string | undefined;
	let outputSchemaCode: string | undefined;

	// Extract input and output schema code
	for (const prop of schemaObj.properties) {
		if (prop.key.type === 'Identifier') {
			if (prop.key.name === 'input' && prop.value) {
				inputSchemaCode = formatSchemaCode(generate(prop.value));
			} else if (prop.key.name === 'output' && prop.value) {
				outputSchemaCode = formatSchemaCode(generate(prop.value));
			}
		}
	}

	return { inputSchemaCode, outputSchemaCode };
}

/**
 * Parse object expression to extract metadata
 */
function parseObjectExpressionToMap(expr: ASTObjectExpression): Map<string, string> {
	const result = new Map<string, string>();
	for (const prop of expr.properties) {
		if (prop.value.type === 'Literal') {
			const value = prop.value as ASTLiteral;
			result.set(prop.key.name, String(value.value));
		}
	}
	return result;
}

/**
 * Extract metadata from createAgent call (READ-ONLY)
 */
function extractAgentMetadata(
	code: string,
	filename: string,
	projectId: string,
	deploymentId: string
): AgentMetadata | null {
	const ast = acornLoose.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

	// Calculate file version (hash of contents)
	const version = hash(code);

	// Find createAgent calls
	for (const node of (ast as { body: ASTNode[] }).body) {
		if (node.type === 'ExportDefaultDeclaration') {
			const declaration = (node as unknown as { declaration: ASTNode }).declaration;

			if (declaration.type === 'CallExpression') {
				const callExpr = declaration as ASTCallExpression;

				if (
					callExpr.callee.type === 'Identifier' &&
					(callExpr.callee as ASTNodeIdentifier).name === 'createAgent' &&
					callExpr.arguments.length >= 2
				) {
					// First arg is agent name
					const nameArg = callExpr.arguments[0] as ASTLiteral;
					const name = String(nameArg.value);

					// Second arg is config object
					const callargexp = callExpr.arguments[1] as ASTObjectExpression;

					// Extract schemas
					const { inputSchemaCode, outputSchemaCode } = extractSchemaCode(callargexp);

					// Extract description from either direct property or metadata object
					let description: string | undefined;
					for (const prop of callargexp.properties) {
						// Check for direct description property
						if (prop.key.name === 'description' && prop.value.type === 'Literal') {
							description = String((prop.value as ASTLiteral).value);
							break; // Direct description takes precedence
						}
						// Also check metadata.description for backwards compat
						if (prop.key.name === 'metadata' && prop.value.type === 'ObjectExpression') {
							const metadataMap = parseObjectExpressionToMap(
								prop.value as ASTObjectExpression
							);
							if (!description) {
								description = metadataMap.get('description');
							}
							break;
						}
					}

					// Generate IDs
					const id = getAgentId(projectId, deploymentId, filename, version);
					const agentId = generateStableAgentId(projectId, name);

					return {
						filename,
						name,
						id,
						agentId,
						version,
						description,
						inputSchemaCode,
						outputSchemaCode,
					};
				}
			}
		}

		// Also check variable declarations (e.g., const agent = createAgent(...))
		if (node.type === 'VariableDeclaration') {
			const declarations = (node as unknown as { declarations: ASTVariableDeclarator[] })
				.declarations;
			for (const decl of declarations) {
				if (decl.init && decl.init.type === 'CallExpression') {
					const callExpr = decl.init as ASTCallExpression;

					if (
						callExpr.callee.type === 'Identifier' &&
						(callExpr.callee as ASTNodeIdentifier).name === 'createAgent' &&
						callExpr.arguments.length >= 2
					) {
						const nameArg = callExpr.arguments[0] as ASTLiteral;
						const name = String(nameArg.value);

						const callargexp = callExpr.arguments[1] as ASTObjectExpression;
						const { inputSchemaCode, outputSchemaCode } = extractSchemaCode(callargexp);

						let description: string | undefined;
						for (const prop of callargexp.properties) {
							// Check for direct description property
							if (prop.key.name === 'description' && prop.value.type === 'Literal') {
								description = String((prop.value as ASTLiteral).value);
								break; // Direct description takes precedence
							}
							// Also check metadata.description for backwards compat
							if (prop.key.name === 'metadata' && prop.value.type === 'ObjectExpression') {
								const metadataMap = parseObjectExpressionToMap(
									prop.value as ASTObjectExpression
								);
								if (!description) {
									description = metadataMap.get('description');
								}
								break;
							}
						}

						const id = getAgentId(projectId, deploymentId, filename, version);
						const agentId = generateStableAgentId(projectId, name);

						return {
							filename,
							name,
							id,
							agentId,
							version,
							description,
							inputSchemaCode,
							outputSchemaCode,
						};
					}
				}
			}
		}
	}

	return null;
}

/**
 * Extract evals from a file (READ-ONLY)
 * Finds createEval calls regardless of whether they're exported or not
 */
async function extractEvalMetadata(
	evalsPath: string,
	relativeEvalsPath: string,
	agentId: string,
	projectId: string,
	deploymentId: string,
	logger: Logger
): Promise<EvalMetadata[]> {
	const evalsFile = Bun.file(evalsPath);
	if (!(await evalsFile.exists())) {
		return [];
	}

	try {
		const evalsSource = await evalsFile.text();
		return extractEvalsFromSource(
			evalsSource,
			relativeEvalsPath,
			agentId,
			projectId,
			deploymentId,
			logger
		);
	} catch (error) {
		logger.warn(`Failed to parse evals from ${evalsPath}: ${error}`);
		return [];
	}
}

/**
 * Extract evals from source code (READ-ONLY)
 * Finds all createEval calls in the source, exported or not
 */
function extractEvalsFromSource(
	source: string,
	filename: string,
	agentId: string,
	projectId: string,
	deploymentId: string,
	logger: Logger
): EvalMetadata[] {
	// Quick check - skip if no createEval in source
	if (!source.includes('createEval')) {
		return [];
	}

	try {
		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(source);
		const version = hash(contents);

		const ast = acornLoose.parse(contents, { ecmaVersion: 'latest', sourceType: 'module' });
		const evals: EvalMetadata[] = [];

		// Recursively find all createEval calls in the AST
		function findCreateEvalCalls(node: unknown): void {
			if (!node || typeof node !== 'object') return;

			const n = node as Record<string, unknown>;

			// Check if this is a createEval call (either direct or method call)
			// Direct: createEval('name', {...})
			// Method: agent.createEval('name', {...})
			let isCreateEvalCall = false;

			if (n.type === 'CallExpression' && n.callee && typeof n.callee === 'object') {
				const callee = n.callee as ASTNode & { property?: ASTNodeIdentifier };

				// Direct function call: createEval(...)
				if (
					callee.type === 'Identifier' &&
					(callee as ASTNodeIdentifier).name === 'createEval'
				) {
					isCreateEvalCall = true;
				}

				// Method call: someAgent.createEval(...)
				if (
					callee.type === 'MemberExpression' &&
					callee.property &&
					callee.property.type === 'Identifier' &&
					callee.property.name === 'createEval'
				) {
					isCreateEvalCall = true;
				}
			}

			if (isCreateEvalCall) {
				const callExpr = n as unknown as ASTCallExpression;
				let evalName: string | undefined;
				let description: string | undefined;

				if (callExpr.arguments.length >= 2) {
					// Format: agent.createEval('name', { config })
					const nameArg = callExpr.arguments[0] as ASTLiteral;
					evalName = String(nameArg.value);

					const callargexp = callExpr.arguments[1] as ASTObjectExpression;
					if (callargexp.properties) {
						for (const prop of callargexp.properties) {
							if (prop.key.name === 'metadata' && prop.value.type === 'ObjectExpression') {
								const metadataMap = parseObjectExpressionToMap(
									prop.value as ASTObjectExpression
								);
								description = metadataMap.get('description');
								break;
							}
						}
					}
				} else if (callExpr.arguments.length === 1) {
					// Format: agent.createEval(presetEval({ name: '...', ... }))
					// or: agent.createEval(presetEval()) - uses preset's default name
					// or: agent.createEval({ name: '...', ... })
					const arg = callExpr.arguments[0] as ASTNode;

					// Handle CallExpression: presetEval({ name: '...' }) or presetEval()
					if (arg.type === 'CallExpression') {
						const innerCall = arg as unknown as ASTCallExpression;

						// Try to get name from the call arguments first
						if (innerCall.arguments.length >= 1) {
							const configArg = innerCall.arguments[0] as ASTObjectExpression;
							if (configArg.type === 'ObjectExpression' && configArg.properties) {
								const configMap = parseObjectExpressionToMap(configArg);
								evalName = configMap.get('name');
								description = configMap.get('description');
							}
						}

						// Fallback: use the callee name as the eval name (e.g., politeness())
						if (!evalName && innerCall.callee) {
							const callee = innerCall.callee as ASTNode;
							if (callee.type === 'Identifier') {
								evalName = (callee as ASTNodeIdentifier).name;
							}
						}
					}

					// Handle ObjectExpression: { name: '...', handler: ... }
					if (arg.type === 'ObjectExpression') {
						const configArg = arg as ASTObjectExpression;
						if (configArg.properties) {
							const configMap = parseObjectExpressionToMap(configArg);
							evalName = configMap.get('name');
							description = configMap.get('description');
						}
					}
				}

				if (evalName) {
					const id = getEvalId(projectId, deploymentId, filename, evalName, version);
					const identifier = generateStableEvalId(projectId, agentId, evalName);

					logger.trace(`Found eval '${evalName}' in ${filename} (identifier: ${identifier})`);

					evals.push({
						id,
						identifier,
						name: evalName,
						filename,
						version,
						description,
						agentIdentifier: agentId,
						projectId,
					});
				}
			}

			// Recursively search child nodes
			for (const key of Object.keys(n)) {
				const value = n[key];
				if (Array.isArray(value)) {
					for (const item of value) {
						findCreateEvalCalls(item);
					}
				} else if (value && typeof value === 'object') {
					findCreateEvalCalls(value);
				}
			}
		}

		findCreateEvalCalls(ast);

		return evals;
	} catch (error) {
		logger.warn(`Failed to parse evals from ${filename}: ${error}`);
		return [];
	}
}

/**
 * Discover all agents in src/agent directory (READ-ONLY)
 */
export async function discoverAgents(
	srcDir: string,
	projectId: string,
	deploymentId: string,
	logger: Logger
): Promise<AgentMetadata[]> {
	const agentsDir = join(srcDir, 'agent');
	const agents: AgentMetadata[] = [];

	// Check if agent directory exists
	if (!existsSync(agentsDir)) {
		logger.trace('No agent directory found at %s', agentsDir);
		return agents;
	}

	const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });

	// Scan all .ts files in agent directory
	const glob = new Bun.Glob('**/*.ts');
	for await (const file of glob.scan(agentsDir)) {
		const filePath = join(agentsDir, file);

		// Skip eval.ts files (processed separately)
		if (file.endsWith('/eval.ts') || file === 'eval.ts') {
			continue;
		}

		try {
			const source = await Bun.file(filePath).text();
			const contents = transpiler.transformSync(source);

			// Use 'src/' prefix for consistency with bun bundler and registry imports
			const rootDir = join(srcDir, '..');
			const relativeFilename = relative(rootDir, filePath);
			const agentMetadata = extractAgentMetadata(
				contents,
				relativeFilename,
				projectId,
				deploymentId
			);

			if (agentMetadata) {
				logger.trace('Discovered agent: %s at %s', agentMetadata.name, relativeFilename);

				// Collect evals from multiple sources
				const allEvals: EvalMetadata[] = [];

				// 1. Extract evals from the agent file itself (agent.createEval() pattern)
				const evalsInAgentFile = extractEvalsFromSource(
					source,
					relativeFilename,
					agentMetadata.agentId,
					projectId,
					deploymentId,
					logger
				);
				if (evalsInAgentFile.length > 0) {
					logger.trace(
						'Found %d eval(s) in agent file for %s',
						evalsInAgentFile.length,
						agentMetadata.name
					);
					allEvals.push(...evalsInAgentFile);
				}

				// 2. Check for evals in separate eval.ts file in same directory
				const agentDir = dirname(filePath);
				const evalsPath = join(agentDir, 'eval.ts');
				const relativeEvalsPath = relative(rootDir, evalsPath);
				const evalsInSeparateFile = await extractEvalMetadata(
					evalsPath,
					relativeEvalsPath,
					agentMetadata.agentId,
					projectId,
					deploymentId,
					logger
				);
				if (evalsInSeparateFile.length > 0) {
					logger.trace(
						'Found %d eval(s) in eval.ts for agent %s',
						evalsInSeparateFile.length,
						agentMetadata.name
					);
					allEvals.push(...evalsInSeparateFile);
				}

				if (allEvals.length > 0) {
					agentMetadata.evals = allEvals;
					logger.trace('Total %d eval(s) for agent %s', allEvals.length, agentMetadata.name);
				}

				agents.push(agentMetadata);
			}
		} catch (error) {
			logger.warn(`Failed to parse agent file ${filePath}: ${error}`);
		}
	}

	logger.debug('Discovered %d agent(s)', agents.length);
	return agents;
}
