import * as acornLoose from 'acorn-loose';
import { basename, dirname, relative } from 'node:path';
import { generate } from 'astring';
import type { BuildMetadata } from '../../types';
import { createLogger } from '@agentuity/server';
import * as ts from 'typescript';
import type { WorkbenchConfig } from '@agentuity/core';
import type { LogLevel } from '../../types';

const logger = createLogger((process.env.AGENTUITY_LOG_LEVEL || 'info') as LogLevel);

interface ASTNode {
	type: string;
}

interface ASTNodeIdentifier extends ASTNode {
	name: string;
}

interface ASTCallExpression extends ASTNode {
	arguments: unknown[];
	callee: ASTMemberExpression;
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
	value: string;
	raw?: string;
}

interface ASTMemberExpression extends ASTNode {
	object: ASTNode;
	property: ASTNode;
	computed: boolean;
	optional: boolean;
	name?: string;
}

interface ASTExpressionStatement extends ASTNode {
	expression: ASTCallExpression;
}

interface ASTVariableDeclarator extends ASTNode {
	id: ASTNode;
	init?: ASTNode;
}

function parseObjectExpressionToMap(expr: ASTObjectExpression): Map<string, string> {
	const result = new Map<string, string>();
	for (const prop of expr.properties) {
		switch (prop.value.type) {
			case 'Literal': {
				const value = prop.value as unknown as ASTLiteral;
				result.set(prop.key.name, value.value);
				break;
			}
			default: {
				console.warn(
					'AST value type %s of metadata key: %s not supported',
					prop.value.type,
					prop.key.name
				);
			}
		}
	}
	return result;
}

function createObjectPropertyNode(key: string, value: string) {
	return {
		type: 'Property',
		kind: 'init',
		key: {
			type: 'Identifier',
			name: key,
		},
		value: {
			type: 'Literal',
			value,
		},
	};
}

function createNewMetadataNode() {
	return {
		type: 'Property',
		kind: 'init',
		key: {
			type: 'Identifier',
			name: 'metadata',
		},
		value: {
			type: 'ObjectExpression',
			properties: [] as ASTPropertyNode[],
		},
	};
}

function hash(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha256');
	val.map((val) => hasher.update(val));
	return hasher.digest().toHex();
}

function hashSHA1(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha1');
	val.map((val) => hasher.update(val));
	return hasher.digest().toHex();
}

export function getDevmodeDeploymentId(projectId: string, endpointId: string): string {
	return `devmode_${hashSHA1(projectId, endpointId)}`;
}

function getAgentId(
	projectId: string,
	deploymentId: string,
	filename: string,
	version: string
): string {
	return `agentid_${hashSHA1(projectId, deploymentId, filename, version)}`;
}

function getEvalId(
	projectId: string,
	deploymentId: string,
	filename: string,
	name: string,
	version: string
): string {
	return `eval_${hashSHA1(projectId, deploymentId, filename, name, version)}`;
}

function generateRouteId(
	projectId: string,
	deploymentId: string,
	type: string,
	method: string,
	filename: string,
	path: string,
	version: string
): string {
	return `route_${hashSHA1(projectId, deploymentId, type, method, filename, path, version)}`;
}

function generateStableAgentId(projectId: string, name: string): string {
	return `agent_${hashSHA1(projectId, name)}`.substring(0, 64);
}

function generateStableEvalId(projectId: string, agentId: string, name: string): string {
	return `evalid_${hashSHA1(projectId, agentId, name)}`.substring(0, 64);
}

type AcornParseResultType = ReturnType<typeof acornLoose.parse>;

function augmentAgentMetadataNode(
	projectId: string,
	id: string,
	identifier: string,
	rel: string,
	version: string,
	ast: AcornParseResultType,
	propvalue: ASTObjectExpression,
	filename: string
): [string, Map<string, string>] {
	const metadata = parseObjectExpressionToMap(propvalue);
	if (!metadata.has('name')) {
		const location = ast.loc?.start ? ` on line ${ast.loc.start}` : '';
		throw new Error(
			`missing required metadata.name in ${filename}${location}. This Agent should have a unique and human readable name for this project.`
		);
	}
	const name = metadata.get('name')!;
	if (metadata.has('identifier') && identifier !== metadata.get('identifier')) {
		const location = ast.loc?.start ? ` on line ${ast.loc.start}` : '';
		throw new Error(
			`metadata.identifier (${metadata.get('identifier')}) in ${filename}${location} is mismatched (${name}). This is an internal error.`
		);
	}
	const descriptionNode = propvalue.properties.find((x) => x.key.name === 'description')?.value;
	const description = descriptionNode ? (descriptionNode as ASTLiteral).value : '';
	const agentId = generateStableAgentId(projectId, name);
	metadata.set('version', version);
	metadata.set('identifier', identifier);
	metadata.set('filename', rel);
	metadata.set('id', id);
	metadata.set('agentId', agentId);
	metadata.set('description', description);
	propvalue.properties.push(
		createObjectPropertyNode('id', id),
		createObjectPropertyNode('agentId', agentId),
		createObjectPropertyNode('version', version),
		createObjectPropertyNode('identifier', name),
		createObjectPropertyNode('filename', rel),
		createObjectPropertyNode('description', description)
	);

	const newsource = generate(ast);

	// Evals imports are now handled in registry.generated.ts
	return [newsource, metadata];
}

function createAgentMetadataNode(
	id: string,
	name: string,
	rel: string,
	version: string,
	ast: AcornParseResultType,
	callargexp: ASTObjectExpression,
	_filename: string
): [string, Map<string, string>] {
	const newmetadata = createNewMetadataNode();
	const md = new Map<string, string>();
	md.set('id', id);
	md.set('version', version);
	md.set('name', name);
	md.set('identifier', name);
	md.set('filename', rel);
	for (const [key, value] of md) {
		newmetadata.value.properties.push(createObjectPropertyNode(key, value));
	}
	callargexp.properties.push(newmetadata);

	const newsource = generate(ast);

	// Evals imports are now handled in registry.generated.ts
	return [newsource, md];
}

function camelToKebab(str: string): string {
	return str
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
		.toLowerCase();
}

function setLiteralValue(literal: ASTLiteral, value: string) {
	literal.value = value;
	if (literal.raw !== undefined) {
		literal.raw = JSON.stringify(value);
	}
}

function augmentEvalMetadataNode(
	projectId: string,
	agentId: string,
	id: string,
	name: string,
	rel: string,
	version: string,
	_ast: AcornParseResultType,
	metadataObj: ASTObjectExpression,
	_filename: string
): void {
	const metadata = parseObjectExpressionToMap(metadataObj);
	// Name can come from metadata.name or variable name (already resolved in caller)
	// If metadata doesn't have name, we'll add it from the resolved name
	if (!metadata.has('name')) {
		metadataObj.properties.push(createObjectPropertyNode('name', name));
	}
	const descriptionNode = metadataObj.properties.find((x) => x.key.name === 'description')?.value;
	const description = descriptionNode ? (descriptionNode as ASTLiteral).value : '';
	const effectiveAgentId = agentId || '';
	const _evalId = getEvalId(projectId, effectiveAgentId, rel, name, version); // Deployment-specific ID (not used, kept for potential future use)
	const stableEvalId = generateStableEvalId(projectId, effectiveAgentId, name);

	// Check if id, version, identifier, filename, evalId already exist
	const existingKeys = new Set<string>();
	for (const prop of metadataObj.properties) {
		if (prop.key.type === 'Identifier') {
			existingKeys.add(prop.key.name);
		}
	}

	// Add or update metadata properties
	if (!existingKeys.has('id')) {
		metadataObj.properties.push(createObjectPropertyNode('id', id));
	} else {
		// Update existing id
		for (const prop of metadataObj.properties) {
			if (prop.key.type === 'Identifier' && prop.key.name === 'id') {
				if (prop.value.type === 'Literal') {
					setLiteralValue(prop.value as ASTLiteral, id);
				}
				break;
			}
		}
	}

	if (!existingKeys.has('version')) {
		metadataObj.properties.push(createObjectPropertyNode('version', version));
	} else {
		for (const prop of metadataObj.properties) {
			if (prop.key.type === 'Identifier' && prop.key.name === 'version') {
				if (prop.value.type === 'Literal') {
					setLiteralValue(prop.value as ASTLiteral, version);
				}
				break;
			}
		}
	}

	if (!existingKeys.has('identifier')) {
		metadataObj.properties.push(createObjectPropertyNode('identifier', name));
	} else {
		for (const prop of metadataObj.properties) {
			if (prop.key.type === 'Identifier' && prop.key.name === 'identifier') {
				if (prop.value.type === 'Literal') {
					setLiteralValue(prop.value as ASTLiteral, name);
				}
				break;
			}
		}
	}

	if (!existingKeys.has('filename')) {
		metadataObj.properties.push(createObjectPropertyNode('filename', rel));
	} else {
		for (const prop of metadataObj.properties) {
			if (prop.key.type === 'Identifier' && prop.key.name === 'filename') {
				if (prop.value.type === 'Literal') {
					setLiteralValue(prop.value as ASTLiteral, rel);
				}
				break;
			}
		}
	}

	if (!existingKeys.has('evalId')) {
		metadataObj.properties.push(createObjectPropertyNode('evalId', stableEvalId));
	} else {
		for (const prop of metadataObj.properties) {
			if (prop.key.type === 'Identifier' && prop.key.name === 'evalId') {
				if (prop.value.type === 'Literal') {
					setLiteralValue(prop.value as ASTLiteral, stableEvalId);
				}
				break;
			}
		}
	}

	if (!existingKeys.has('description')) {
		metadataObj.properties.push(createObjectPropertyNode('description', description));
	} else {
		for (const prop of metadataObj.properties) {
			if (prop.key.type === 'Identifier' && prop.key.name === 'description') {
				if (prop.value.type === 'Literal') {
					setLiteralValue(prop.value as ASTLiteral, description);
				}
				break;
			}
		}
	}
}

export function parseEvalMetadata(
	rootDir: string,
	filename: string,
	contents: string,
	projectId: string,
	deploymentId: string,
	agentId?: string
): [
	string,
	Array<{
		filename: string;
		id: string;
		version: string;
		identifier: string;
		name: string;
		evalId: string;
		description?: string;
	}>,
] {
	const logLevel = (process.env.AGENTUITY_LOG_LEVEL || 'info') as
		| 'trace'
		| 'debug'
		| 'info'
		| 'warn'
		| 'error';
	const logger = createLogger(logLevel);
	logger.trace(`Parsing evals from ${filename}`);
	const ast = acornLoose.parse(contents, { ecmaVersion: 'latest', sourceType: 'module' });
	const rel = relative(rootDir, filename);
	const version = hash(contents);
	const evals: Array<{
		filename: string;
		id: string;
		version: string;
		identifier: string;
		name: string;
		evalId: string;
		description?: string;
	}> = [];

	// Find all exported agent.createEval() calls
	for (const body of ast.body) {
		let variableDeclaration: { declarations: Array<ASTVariableDeclarator> } | undefined;

		// Only process exported VariableDeclarations
		if (body.type === 'ExportNamedDeclaration') {
			const exportDecl = body as {
				declaration?: { type: string; declarations?: Array<ASTVariableDeclarator> };
			};
			if (exportDecl.declaration?.type === 'VariableDeclaration') {
				variableDeclaration = exportDecl.declaration as {
					declarations: Array<ASTVariableDeclarator>;
				};
			}
		}

		if (variableDeclaration) {
			for (const vardecl of variableDeclaration.declarations) {
				if (vardecl.type === 'VariableDeclarator' && vardecl.init?.type === 'CallExpression') {
					const call = vardecl.init as ASTCallExpression;
					if (call.callee.type === 'MemberExpression') {
						const memberExpr = call.callee as ASTMemberExpression;
						const object = memberExpr.object as ASTNodeIdentifier;
						const property = memberExpr.property as ASTNodeIdentifier;
						if (
							object.type === 'Identifier' &&
							object.name === 'agent' &&
							property.type === 'Identifier' &&
							property.name === 'createEval'
						) {
							// Found agent.createEval() call
							if (call.arguments.length > 0) {
								const firstArg = call.arguments[0] as ASTNode;
								if (firstArg.type === 'ObjectExpression') {
									const evalConfig = firstArg as ASTObjectExpression;
									let evalName: string | undefined;
									let evalDescription: string | undefined;
									let variableName: string | undefined;
									let metadataObj: ASTObjectExpression | undefined;

									// Capture variable name if available
									if (vardecl.id.type === 'Identifier') {
										variableName = (vardecl.id as ASTNodeIdentifier).name;
									}

									// Extract metadata from the eval config
									for (const prop of evalConfig.properties) {
										if (prop.key.type === 'Identifier' && prop.key.name === 'metadata') {
											if (prop.value.type === 'ObjectExpression') {
												metadataObj = prop.value as ASTObjectExpression;
												for (const metaProp of metadataObj.properties) {
													if (metaProp.key.type === 'Identifier') {
														if (
															metaProp.key.name === 'name' &&
															metaProp.value.type === 'Literal'
														) {
															evalName = (metaProp.value as ASTLiteral).value;
														} else if (
															metaProp.key.name === 'description' &&
															metaProp.value.type === 'Literal'
														) {
															evalDescription = (metaProp.value as ASTLiteral).value;
														}
													}
												}
											}
										}
									}

									// Use metadata.name if provided, otherwise use variable name
									// Throw error if neither is available (should never happen)
									let finalName: string;
									if (evalName) {
										finalName = evalName;
									} else if (variableName) {
										finalName = camelToKebab(variableName);
									} else {
										throw new Error(
											'Eval is missing a name. Please provide metadata.name or use a named export.'
										);
									}

									logger.trace(
										`Found eval: ${finalName}${evalDescription ? ` - ${evalDescription}` : ''}`
									);
									const evalId = getEvalId(
										projectId,
										deploymentId,
										rel,
										finalName,
										version
									);

									// Inject metadata into AST if metadata object exists
									let stableEvalId: string;
									const effectiveAgentId = agentId || '';
									if (metadataObj) {
										augmentEvalMetadataNode(
											projectId,
											effectiveAgentId,
											evalId,
											finalName,
											rel,
											version,
											ast,
											metadataObj,
											filename
										);
										// Extract evalId from metadata after augmentation
										const metadata = parseObjectExpressionToMap(metadataObj);
										stableEvalId =
											metadata.get('evalId') ||
											generateStableEvalId(projectId, effectiveAgentId, finalName);
									} else {
										// If no metadata object, generate stable evalId
										stableEvalId = generateStableEvalId(
											projectId,
											effectiveAgentId,
											finalName
										);
									}

									evals.push({
										filename: rel,
										id: evalId,
										version,
										identifier: finalName,
										name: finalName,
										evalId: stableEvalId,
										description: evalDescription,
									});
								}
							}
						}
					}
				}
			}
		}
	}

	// Check for duplicate eval names in the same file
	// This prevents hash collisions when projectId/deploymentId are empty
	const seenNames = new Map<string, number>();
	for (const evalItem of evals) {
		const count = seenNames.get(evalItem.name) || 0;
		seenNames.set(evalItem.name, count + 1);
	}

	const duplicates: string[] = [];
	for (const [name, count] of seenNames.entries()) {
		if (count > 1) {
			duplicates.push(name);
		}
	}

	if (duplicates.length > 0) {
		throw new Error(
			`Duplicate eval names found in ${rel}: ${duplicates.join(', ')}. ` +
				'Eval names must be unique within the same file to prevent ID collisions.'
		);
	}

	const newsource = generate(ast);
	logger.trace(`Parsed ${evals.length} eval(s) from ${filename}`);
	return [newsource, evals];
}

export async function parseAgentMetadata(
	rootDir: string,
	filename: string,
	contents: string,
	projectId: string,
	deploymentId: string
): Promise<[string, Map<string, string>]> {
	const ast = acornLoose.parse(contents, { ecmaVersion: 'latest', sourceType: 'module' });
	let exportName: string | undefined;
	const rel = relative(rootDir, filename);
	const name = basename(dirname(filename));
	const version = hash(contents);
	const id = getAgentId(projectId, deploymentId, rel, version);

	let result: [string, Map<string, string>] | undefined;

	for (const body of ast.body) {
		if (body.type === 'ExportDefaultDeclaration') {
			if (body.declaration?.type === 'CallExpression') {
				const call = body.declaration as ASTCallExpression;
				if (call.callee.name === 'createAgent') {
					for (const callarg of call.arguments) {
						const callargexp = callarg as ASTObjectExpression;
						for (const prop of callargexp.properties) {
							if (prop.key.type === 'Identifier' && prop.key.name === 'metadata') {
								result = augmentAgentMetadataNode(
									projectId,
									id,
									name,
									rel,
									version,
									ast,
									prop.value as ASTObjectExpression,
									filename
								);
								break;
							}
						}
						if (!result) {
							result = createAgentMetadataNode(
								id,
								name,
								rel,
								version,
								ast,
								callargexp,
								filename
							);
						}
						break;
					}
				}
			}
			if (!result) {
				const identifier = body.declaration as ASTNodeIdentifier;
				exportName = identifier.name;
				break;
			}
		}
	}
	if (!result && !exportName) {
		throw new Error(`could not find default export for ${filename} using ${rootDir}`);
	}
	if (!result) {
		for (const body of ast.body) {
			if (body.type === 'VariableDeclaration') {
				for (const vardecl of body.declarations) {
					if (vardecl.type === 'VariableDeclarator' && vardecl.id.type === 'Identifier') {
						const identifier = vardecl.id as ASTNodeIdentifier;
						if (identifier.name === exportName) {
							if (vardecl.init?.type === 'CallExpression') {
								const call = vardecl.init as ASTCallExpression;
								if (call.callee.name === 'createAgent') {
									for (const callarg of call.arguments) {
										const callargexp = callarg as ASTObjectExpression;
										for (const prop of callargexp.properties) {
											if (
												prop.key.type === 'Identifier' &&
												prop.key.name === 'metadata'
											) {
												result = augmentAgentMetadataNode(
													projectId,
													id,
													name,
													rel,
													version,
													ast,
													prop.value as ASTObjectExpression,
													filename
												);
												break;
											}
										}
										if (!result) {
											result = createAgentMetadataNode(
												id,
												name,
												rel,
												version,
												ast,
												callargexp,
												filename
											);
										}
										break;
									}
								}
							}
						}
					}
				}
			}
		}
	}
	if (!result) {
		throw new Error(
			`error parsing: ${filename}. could not find an proper createAgent defined in this file`
		);
	}

	// Parse evals from eval.ts file in the same directory
	const logLevel = (process.env.AGENTUITY_LOG_LEVEL || 'info') as
		| 'trace'
		| 'debug'
		| 'info'
		| 'warn'
		| 'error';
	const logger = createLogger(logLevel);
	const agentDir = dirname(filename);
	const evalsPath = `${agentDir}/eval.ts`;
	logger.trace(`Checking for evals file at ${evalsPath}`);
	const evalsFile = Bun.file(evalsPath);
	if (await evalsFile.exists()) {
		logger.trace(`Found evals file at ${evalsPath}, parsing...`);
		const evalsSource = await evalsFile.text();
		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const evalsContents = transpiler.transformSync(evalsSource);
		const agentId = result[1].get('agentId') || '';
		const [, evals] = parseEvalMetadata(
			rootDir,
			evalsPath,
			evalsContents,
			projectId,
			deploymentId,
			agentId
		);
		if (evals.length > 0) {
			logger.trace(`Adding ${evals.length} eval(s) to agent metadata for ${name}`);
			result[1].set('evals', JSON.stringify(evals));
		} else {
			logger.trace(`No evals found in ${evalsPath}`);
		}
	} else {
		logger.trace(`No evals file found at ${evalsPath}`);
	}

	return result;
}

type RouteDefinition = BuildMetadata['routes'];

export async function parseRoute(
	rootDir: string,
	filename: string,
	projectId: string,
	deploymentId: string
): Promise<BuildMetadata['routes']> {
	const contents = await Bun.file(filename).text();
	const version = hash(contents);
	const ast = acornLoose.parse(contents, { ecmaVersion: 'latest', sourceType: 'module' });
	let exportName: string | undefined;
	let variableName: string | undefined;
	for (const body of ast.body) {
		if (body.type === 'ExportDefaultDeclaration') {
			const identifier = body.declaration as ASTNodeIdentifier;
			exportName = identifier.name;
			break;
		}
	}
	if (!exportName) {
		throw new Error(`could not find default export for ${filename} using ${rootDir}`);
	}
	for (const body of ast.body) {
		if (body.type === 'VariableDeclaration') {
			for (const vardecl of body.declarations) {
				if (vardecl.type === 'VariableDeclarator' && vardecl.id.type === 'Identifier') {
					const identifier = vardecl.id as ASTNodeIdentifier;
					if (identifier.name === exportName) {
						if (vardecl.init?.type === 'CallExpression') {
							const call = vardecl.init as ASTCallExpression;
							if (call.callee.name === 'createRouter') {
								variableName = identifier.name;
								break;
							}
						}
					}
				}
			}
		}
	}
	if (!variableName) {
		throw new Error(
			`error parsing: ${filename}. could not find an proper createRouter defined in this file`
		);
	}

	const rel = relative(rootDir, filename);
	const dir = dirname(filename);
	const name = basename(dir);

	// Detect if this is a subagent route and build proper path
	const relativePath = relative(rootDir, dir)
		.replace(/^src\/agents\//, '')
		.replace(/^src\/apis\//, '');
	const pathParts = relativePath.split('/').filter(Boolean);
	const isSubagent = pathParts.length === 2 && filename.includes('src/agents');
	const routeName = isSubagent ? pathParts.join('/') : name;

	const routes: RouteDefinition = [];
	const routePrefix = filename.includes('src/agents') ? '/agent' : '/api';

	try {
		for (const body of ast.body) {
			if (body.type === 'ExpressionStatement') {
				const statement = body as ASTExpressionStatement;

				// Validate that the expression is a call expression (e.g. function call)
				if (statement.expression.type !== 'CallExpression') {
					continue;
				}

				const callee = statement.expression.callee;

				// Validate that the callee is a member expression (e.g. object.method())
				// This handles cases like 'console.log()' or 'router.get()'
				// direct function calls like 'myFunc()' have type 'Identifier' and will be skipped
				if (callee.type !== 'MemberExpression') {
					continue;
				}

				if (callee.object.type === 'Identifier' && statement.expression.arguments?.length > 0) {
					const identifier = callee.object as ASTNodeIdentifier;
					if (identifier.name === variableName) {
						let method = (callee.property as ASTNodeIdentifier).name;
						let type = 'api';
						const action = statement.expression.arguments[0];
						let suffix = '';
						let config: Record<string, unknown> | undefined;
						switch (method) {
							case 'get':
							case 'put':
							case 'post':
							case 'patch':
							case 'delete': {
								if (action && (action as ASTLiteral).type === 'Literal') {
									suffix = (action as ASTLiteral).value;
								} else {
									throw new Error(
										`unsupported HTTP method ${method} in ${filename} at line ${body.start}`
									);
								}
								break;
							}
							case 'stream':
							case 'sse':
							case 'websocket': {
								type = method;
								method = 'post';
								const theaction = action as ASTLiteral;
								if (theaction.type === 'Literal') {
									suffix = theaction.value;
									break;
								}
								break;
							}
							case 'sms': {
								type = method;
								method = 'post';
								const theaction = action as ASTObjectExpression;
								if (theaction.type === 'ObjectExpression') {
									config = {};
									theaction.properties.forEach((p) => {
										if (p.value.type === 'Literal') {
											const literal = p.value as ASTLiteral;
											config![p.key.name] = literal.value;
										}
									});
									const number = theaction.properties.find((p) => p.key.name === 'number');
									if (number && number.value.type === 'Literal') {
										const phoneNumber = number.value as ASTLiteral;
										suffix = hash(phoneNumber.value);
										break;
									}
								}
								break;
							}
							case 'email': {
								type = method;
								method = 'post';
								const theaction = action as ASTLiteral;
								if (theaction.type === 'Literal') {
									const email = theaction.value;
									suffix = hash(email);
									break;
								}
								break;
							}
							case 'cron': {
								type = method;
								method = 'post';
								const theaction = action as ASTLiteral;
								if (theaction.type === 'Literal') {
									const number = theaction.value;
									suffix = hash(number);
									break;
								}
								break;
							}
							default: {
								throw new Error(
									`unsupported router method ${method} in ${filename} at line ${body.start}`
								);
							}
						}
						const thepath = `${routePrefix}/${routeName}/${suffix}`
							.replaceAll(/\/{2,}/g, '/')
							.replaceAll(/\/$/g, '');
						const id = generateRouteId(
							projectId,
							deploymentId,
							type,
							method,
							rel,
							thepath,
							version
						);
						routes.push({
							id,
							method: method as 'get' | 'post' | 'put' | 'delete' | 'patch',
							type: type as 'api' | 'sms' | 'email' | 'cron',
							filename: rel,
							path: thepath,
							version,
							config,
						});
					}
				}
			}
		}
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		throw new Error(`Failed to parse route file ${filename}: ${err.message}`);
	}
	return routes;
}

/**
 * Result of workbench analysis
 */
export interface WorkbenchAnalysis {
	hasWorkbench: boolean;
	config: WorkbenchConfig | null;
}

/**
 * Check if a TypeScript file actively uses a specific function
 * (ignores comments and unused imports)
 *
 * @param content - The TypeScript source code
 * @param functionName - The function name to check for (e.g., 'createWorkbench')
 * @returns true if the function is both imported and called
 */
export function checkFunctionUsage(content: string, functionName: string): boolean {
	try {
		const sourceFile = ts.createSourceFile('temp.ts', content, ts.ScriptTarget.Latest, true);

		let hasImport = false;
		let hasUsage = false;

		function visitNode(node: ts.Node): void {
			// Check for import declarations with the function
			if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
				if (ts.isNamedImports(node.importClause.namedBindings)) {
					for (const element of node.importClause.namedBindings.elements) {
						if (element.name.text === functionName) {
							hasImport = true;
						}
					}
				}
			}
			// Check for function calls
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
				if (node.expression.text === functionName) {
					hasUsage = true;
				}
			}
			// Recursively visit child nodes
			ts.forEachChild(node, visitNode);
		}

		visitNode(sourceFile);
		// Only return true if both import and usage are present
		return hasImport && hasUsage;
	} catch (error) {
		// Fallback to string check if AST parsing fails
		logger.warn(`AST parsing failed for ${functionName}, falling back to string check:`, error);
		return content.includes(functionName);
	}
}

/**
 * Check if app.ts contains conflicting routes for a given endpoint
 */
export function checkRouteConflicts(content: string, workbenchEndpoint: string): boolean {
	try {
		const sourceFile = ts.createSourceFile('app.ts', content, ts.ScriptTarget.Latest, true);

		let hasConflict = false;

		function visitNode(node: ts.Node): void {
			// Check for router.get calls
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				ts.isIdentifier(node.expression.name) &&
				node.expression.name.text === 'get'
			) {
				// Check if first argument is the workbench endpoint
				if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
					if (node.arguments[0].text === workbenchEndpoint) {
						hasConflict = true;
					}
				}
			}

			ts.forEachChild(node, visitNode);
		}

		visitNode(sourceFile);
		return hasConflict;
	} catch (_error) {
		return false;
	}
}

/**
 * Analyze workbench usage and extract configuration
 *
 * @param content - The TypeScript source code
 * @returns workbench analysis including usage and config
 */
export function analyzeWorkbench(content: string): WorkbenchAnalysis {
	try {
		const sourceFile = ts.createSourceFile('app.ts', content, ts.ScriptTarget.Latest, true);

		let hasImport = false;
		let hasUsage = false;
		let config: WorkbenchConfig | null = null;

		function visitNode(node: ts.Node): void {
			// Check for import declarations with createWorkbench
			if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
				if (ts.isNamedImports(node.importClause.namedBindings)) {
					for (const element of node.importClause.namedBindings.elements) {
						if (element.name.text === 'createWorkbench') {
							hasImport = true;
						}
					}
				}
			}

			// Check for createWorkbench function calls and extract config
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
				if (node.expression.text === 'createWorkbench') {
					hasUsage = true;

					// Extract configuration from the first argument (if any)
					if (node.arguments.length > 0) {
						const configArg = node.arguments[0];
						config = parseConfigObject(configArg);
					} else {
						// Default config if no arguments provided
						config = { route: '/workbench' };
					}
				}
			}

			// Recursively visit child nodes
			ts.forEachChild(node, visitNode);
		}

		visitNode(sourceFile);

		// Set default config if workbench is used but no config was parsed
		if (hasImport && hasUsage && !config) {
			config = { route: '/workbench' };
		}

		return {
			hasWorkbench: hasImport && hasUsage,
			config: config,
		};
	} catch (error) {
		// Fallback to simple check if AST parsing fails
		logger.warn('Workbench AST parsing failed, falling back to string check:', error);
		const hasWorkbench = content.includes('createWorkbench');
		return {
			hasWorkbench,
			config: hasWorkbench ? { route: '/workbench' } : null,
		};
	}
}

/**
 * Parse a TypeScript object literal to extract configuration
 */
function parseConfigObject(node: ts.Node): WorkbenchConfig | null {
	if (!ts.isObjectLiteralExpression(node)) {
		return { route: '/workbench' }; // Default config
	}

	const config: WorkbenchConfig = { route: '/workbench' };

	for (const property of node.properties) {
		if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
			const propertyName = property.name.text;

			if (propertyName === 'route' && ts.isStringLiteral(property.initializer)) {
				config.route = property.initializer.text;
			} else if (
				propertyName === 'headers' &&
				ts.isObjectLiteralExpression(property.initializer)
			) {
				// Parse headers object if needed (not implemented for now)
				config.headers = {};
			}
		}
	}

	return config;
}
