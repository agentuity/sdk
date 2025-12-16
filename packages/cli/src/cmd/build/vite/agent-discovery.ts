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
	evalId: string;
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
 * Extract evals from eval.ts file (READ-ONLY)
 */
async function extractEvalMetadata(
	evalsPath: string,
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
		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const evalsContents = transpiler.transformSync(evalsSource);
		const version = hash(evalsContents);

		const ast = acornLoose.parse(evalsContents, { ecmaVersion: 'latest', sourceType: 'module' });
		const evals: EvalMetadata[] = [];

		// Find createEval calls
		for (const node of (ast as { body: ASTNode[] }).body) {
			if (node.type === 'ExportNamedDeclaration') {
				const declaration = (
					node as unknown as { declaration: { declarations?: ASTVariableDeclarator[] } }
				).declaration;

				if (declaration?.declarations) {
					for (const decl of declaration.declarations) {
						if (decl.init && decl.init.type === 'CallExpression') {
							const callExpr = decl.init as ASTCallExpression;

							if (
								callExpr.callee.type === 'Identifier' &&
								(callExpr.callee as ASTNodeIdentifier).name === 'createEval' &&
								callExpr.arguments.length >= 2
							) {
								const nameArg = callExpr.arguments[0] as ASTLiteral;
								const evalName = String(nameArg.value);

								const callargexp = callExpr.arguments[1] as ASTObjectExpression;
								let description: string | undefined;

								for (const prop of callargexp.properties) {
									if (
										prop.key.name === 'metadata' &&
										prop.value.type === 'ObjectExpression'
									) {
										const metadataMap = parseObjectExpressionToMap(
											prop.value as ASTObjectExpression
										);
										description = metadataMap.get('description');
										break;
									}
								}

								const id = getEvalId(projectId, deploymentId, evalsPath, evalName, version);
								const evalId = generateStableEvalId(projectId, agentId, evalName);

								evals.push({
									id,
									evalId,
									name: evalName,
									filename: evalsPath,
									version,
									description,
									agentIdentifier: agentId,
									projectId,
								});
							}
						}
					}
				}
			}
		}

		return evals;
	} catch (error) {
		logger.warn(`Failed to parse evals from ${evalsPath}: ${error}`);
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

				// Check for evals in same directory
				const agentDir = dirname(filePath);
				const evalsPath = join(agentDir, 'eval.ts');
				const evals = await extractEvalMetadata(
					evalsPath,
					agentMetadata.agentId,
					projectId,
					deploymentId,
					logger
				);

				if (evals.length > 0) {
					agentMetadata.evals = evals;
					logger.trace('Found %d eval(s) for agent %s', evals.length, agentMetadata.name);
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
