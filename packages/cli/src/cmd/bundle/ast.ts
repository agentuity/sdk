import * as acornLoose from 'acorn-loose';
import { basename, dirname, relative } from 'node:path';
import { generate } from 'astring';
import type { BuildMetadata } from '../../types';
import { createLogger } from '@agentuity/server';

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

function getAgentId(
	projectId: string,
	deploymentId: string,
	filename: string,
	version: string
): string {
	return `agent_${hashSHA1(projectId, deploymentId, filename, version)}`;
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

type AcornParseResultType = ReturnType<typeof acornLoose.parse>;

function augmentAgentMetadataNode(
	id: string,
	name: string,
	rel: string,
	version: string,
	ast: AcornParseResultType,
	propvalue: ASTObjectExpression,
	_filename: string
): [string, Map<string, string>] {
	const metadata = parseObjectExpressionToMap(propvalue);
	if (!metadata.has('name')) {
		metadata.set('name', name);
		propvalue.properties.push(createObjectPropertyNode('name', name));
	}
	metadata.set('version', version);
	metadata.set('identifier', name);
	metadata.set('filename', rel);
	metadata.set('id', id);
	propvalue.properties.push(
		createObjectPropertyNode('id', id),
		createObjectPropertyNode('version', version),
		createObjectPropertyNode('identifier', name),
		createObjectPropertyNode('filename', rel)
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
	id: string,
	name: string,
	rel: string,
	version: string,
	identifier: string,
	metadataObj: ASTObjectExpression
): void {
	// Check if id, version, identifier, filename already exist
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
		metadataObj.properties.push(createObjectPropertyNode('identifier', identifier));
	} else {
		for (const prop of metadataObj.properties) {
			if (prop.key.type === 'Identifier' && prop.key.name === 'identifier') {
				if (prop.value.type === 'Literal') {
					setLiteralValue(prop.value as ASTLiteral, identifier);
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
}

export function parseEvalMetadata(
	rootDir: string,
	filename: string,
	contents: string,
	projectId: string,
	deploymentId: string
): [
	string,
	Array<{
		filename: string;
		id: string;
		version: string;
		identifier: string;
		name: string;
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
	const dir = dirname(filename);
	const identifier = basename(dir);
	const version = hash(contents);
	const evals: Array<{
		filename: string;
		id: string;
		version: string;
		identifier: string;
		name: string;
		description?: string;
	}> = [];

	// Find all agent.createEval() calls
	for (const body of ast.body) {
		let variableDeclaration: { declarations: Array<ASTVariableDeclarator> } | undefined;

		// Handle both direct VariableDeclaration and ExportNamedDeclaration
		if (body.type === 'VariableDeclaration') {
			variableDeclaration = body as { declarations: Array<ASTVariableDeclarator> };
		} else if (body.type === 'ExportNamedDeclaration') {
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
									if (metadataObj) {
										augmentEvalMetadataNode(
											evalId,
											finalName,
											rel,
											version,
											identifier,
											metadataObj
										);
									}

									evals.push({
										filename: rel,
										id: evalId,
										version,
										identifier,
										name: finalName,
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
		const transpiler = new Bun.Transpiler({ loader: 'ts' });
		const evalsContents = transpiler.transformSync(evalsSource);
		const [, evals] = parseEvalMetadata(
			rootDir,
			evalsPath,
			evalsContents,
			projectId,
			deploymentId
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

	for (const body of ast.body) {
		if (body.type === 'ExpressionStatement') {
			const statement = body as ASTExpressionStatement;
			const callee = statement.expression.callee;
			if (callee.object.type === 'Identifier') {
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
							const theaction = action as ASTLiteral;
							if (theaction.type === 'Literal') {
								suffix = theaction.value;
								break;
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
	return routes;
}
