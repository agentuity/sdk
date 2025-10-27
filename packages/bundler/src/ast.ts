import * as acornLoose from 'acorn-loose';
import { basename, dirname, relative } from 'node:path';
import { generate } from 'astring';

interface ASTNode {
	type: string;
}

interface ASTNodeIdentifier extends ASTNode {
	name: string;
}

interface ASTCallExpression extends ASTNode {
	arguments: unknown[];
	callee: {
		name: string;
	};
}

interface ASTPropertyNode {
	type: string;
	kind: string;
	key: ASTNodeIdentifier;
	value: ASTNode;
}

interface ASTObjectExpression extends ASTNode {
	properties: ASTPropertyNode[];
}

interface ASTLiteral {
	value: string;
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

	// Handle export default createAgent(...) shorthand
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
	// handle separate const agent = createAgent(...)
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
