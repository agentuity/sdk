import * as acornLoose from 'acorn-loose';
import { basename, dirname, relative } from 'node:path';
import { generate } from 'astring';
import { BuildMetadata } from '../../types';

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

const projectId = process.env.AGENTUITY_CLOUD_PROJECT_ID ?? '';

function hash(...val: string[]): string {
	const hasher = new Bun.CryptoHasher('sha256');
	val.forEach((val) => hasher.update(val));
	return hasher.digest().toHex();
}

function getAgentId(identifier: string): string {
	return hash(projectId, identifier);
}

function generateRouteId(method: string, path: string): string {
	return hash(projectId, method, path);
}

type AcornParseResultType = ReturnType<typeof acornLoose.parse>;

function augmentAgentMetadataNode(
	id: string,
	name: string,
	rel: string,
	version: string,
	ast: AcornParseResultType,
	propvalue: ASTObjectExpression
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
	return [newsource, metadata];
}

function createAgentMetadataNode(
	id: string,
	name: string,
	rel: string,
	version: string,
	ast: AcornParseResultType,
	callargexp: ASTObjectExpression
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
	return [newsource, md];
}

export function parseAgentMetadata(
	rootDir: string,
	filename: string,
	contents: string
): [string, Map<string, string>] {
	const ast = acornLoose.parse(contents, { ecmaVersion: 'latest', sourceType: 'module' });
	let exportName: string | undefined;
	const rel = relative(rootDir, filename);
	const name = basename(dirname(filename));
	const id = getAgentId(name);
	const version = hash(contents);

	for (const body of ast.body) {
		if (body.type === 'ExportDefaultDeclaration') {
			if (body.declaration?.type === 'CallExpression') {
				const call = body.declaration as ASTCallExpression;
				if (call.callee.name === 'createAgent') {
					for (const callarg of call.arguments) {
						const callargexp = callarg as ASTObjectExpression;
						for (const prop of callargexp.properties) {
							if (prop.key.type === 'Identifier' && prop.key.name === 'metadata') {
								return augmentAgentMetadataNode(
									id,
									name,
									rel,
									version,
									ast,
									prop.value as ASTObjectExpression
								);
							}
						}
						return createAgentMetadataNode(id, name, rel, version, ast, callargexp);
					}
				}
			}
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
							if (call.callee.name === 'createAgent') {
								for (const callarg of call.arguments) {
									const callargexp = callarg as ASTObjectExpression;
									for (const prop of callargexp.properties) {
										if (prop.key.type === 'Identifier' && prop.key.name === 'metadata') {
											return augmentAgentMetadataNode(
												id,
												name,
												rel,
												version,
												ast,
												prop.value as ASTObjectExpression
											);
										}
									}
									return createAgentMetadataNode(id, name, rel, version, ast, callargexp);
								}
							}
						}
					}
				}
			}
		}
	}
	throw new Error(
		`error parsing: ${filename}. could not find an proper createAgent defined in this file`
	);
}

type RouteDefinition = BuildMetadata['routes'];

export async function parseRoute(
	rootDir: string,
	filename: string
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
	const name = basename(dirname(filename));
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
					const thepath = `${routePrefix}/${name}/${suffix}`
						.replaceAll(/\/{2,}/g, '/')
						.replaceAll(/\/$/g, '');
					routes.push({
						id: generateRouteId(method, thepath),
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
