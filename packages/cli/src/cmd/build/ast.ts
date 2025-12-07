import * as acornLoose from 'acorn-loose';
import { dirname, relative } from 'node:path';
import { parse as parseCronExpression } from '@datasert/cronjs-parser';
import { generate } from 'astring';
import type { BuildMetadata } from '../../types';
import { createLogger } from '@agentuity/server';
import * as ts from 'typescript';
import { StructuredError, type WorkbenchConfig } from '@agentuity/core';
import type { LogLevel } from '../../types';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import JSON5 from 'json5';
import { formatSchemaCode } from './format-schema';

const logger = createLogger((process.env.AGENTUITY_LOG_LEVEL || 'info') as LogLevel);

interface ASTProgram extends ASTNode {
	body: ASTNode[];
}

interface ASTNode {
	type: string;
	start?: number;
	end?: number;
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

/**
 * Type guard to check if an AST node is an ObjectExpression
 */
function isObjectExpression(node: unknown): node is ASTObjectExpression {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return typeof node === 'object' && node !== null && (node as any).type === 'ObjectExpression';
}

/**
 * Extract schema code from createAgent call arguments
 * Returns input and output schema code as strings
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
				// Generate source code from AST node and format it
				inputSchemaCode = formatSchemaCode(generate(prop.value));
			} else if (prop.key.name === 'output' && prop.value) {
				// Generate source code from AST node and format it
				outputSchemaCode = formatSchemaCode(generate(prop.value));
			}
		}
	}

	return { inputSchemaCode, outputSchemaCode };
}

type AcornParseResultType = ReturnType<typeof acornLoose.parse>;

const MetadataError = StructuredError('MetatadataNameMissingError')<{
	filename: string;
	line?: number;
}>();

function augmentAgentMetadataNode(
	projectId: string,
	id: string,
	rel: string,
	version: string,
	ast: AcornParseResultType,
	propvalue: ASTObjectExpression,
	filename: string,
	inputSchemaCode?: string,
	outputSchemaCode?: string
): [string, Map<string, string>] {
	const metadata = parseObjectExpressionToMap(propvalue);
	if (!metadata.has('name')) {
		const location = ast.loc?.start?.line ? ` on line ${ast.loc.start.line}` : '';
		throw new MetadataError({
			filename,
			line: ast.loc?.start?.line,
			message: `missing required metadata.name in ${filename}${location}. This Agent should have a unique and human readable name for this project.`,
		});
	}
	const name = metadata.get('name')!;
	const descriptionNode = propvalue.properties.find((x) => x.key.name === 'description')?.value;
	const description = descriptionNode ? (descriptionNode as ASTLiteral).value : '';
	const agentId = generateStableAgentId(projectId, name);
	metadata.set('version', version);
	metadata.set('filename', rel);
	metadata.set('id', id);
	metadata.set('agentId', agentId);
	metadata.set('description', description);
	if (inputSchemaCode) {
		metadata.set('inputSchemaCode', inputSchemaCode);
	}
	if (outputSchemaCode) {
		metadata.set('outputSchemaCode', outputSchemaCode);
	}
	propvalue.properties.push(
		createObjectPropertyNode('id', id),
		createObjectPropertyNode('agentId', agentId),
		createObjectPropertyNode('version', version),
		createObjectPropertyNode('filename', rel),
		createObjectPropertyNode('description', description)
	);
	if (inputSchemaCode) {
		propvalue.properties.push(createObjectPropertyNode('inputSchemaCode', inputSchemaCode));
	}
	if (outputSchemaCode) {
		propvalue.properties.push(createObjectPropertyNode('outputSchemaCode', outputSchemaCode));
	}

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
	_filename: string,
	projectId: string,
	inputSchemaCode?: string,
	outputSchemaCode?: string
): [string, Map<string, string>] {
	const newmetadata = createNewMetadataNode();
	const agentId = generateStableAgentId(projectId, name);
	const md = new Map<string, string>();
	md.set('id', id);
	md.set('agentId', agentId);
	md.set('version', version);
	md.set('name', name);
	md.set('filename', rel);
	if (inputSchemaCode) {
		md.set('inputSchemaCode', inputSchemaCode);
	}
	if (outputSchemaCode) {
		md.set('outputSchemaCode', outputSchemaCode);
	}
	for (const [key, value] of md) {
		newmetadata.value.properties.push(createObjectPropertyNode(key, value));
	}
	callargexp.properties.push(newmetadata);

	const newsource = generate(ast);

	// Evals imports are now handled in registry.generated.ts
	return [newsource, md];
}

const DuplicateNameError = StructuredError('DuplicateNameError')<{ filename: string }>();

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
	const ast = acornLoose.parse(contents, {
		locations: true,
		ecmaVersion: 'latest',
		sourceType: 'module',
	});
	const rel = relative(rootDir, filename);
	const version = hash(contents);
	const evals: Array<{
		filename: string;
		id: string;
		version: string;
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
							// New signature: agent.createEval(name, { description?, handler })
							if (call.arguments.length >= 2) {
								const firstArg = call.arguments[0] as ASTNode;
								const secondArg = call.arguments[1] as ASTNode;

								let evalName: string | undefined;
								let evalDescription: string | undefined;
								let configObj: ASTObjectExpression | undefined;

								// First argument should be a string literal (the name)
								if (
									firstArg.type === 'Literal' &&
									typeof (firstArg as ASTLiteral).value === 'string'
								) {
									evalName = (firstArg as ASTLiteral).value;
								} else {
									throw new MetadataError({
										filename,
										line: body.loc?.start?.line,
										message:
											'agent.createEval() first argument must be a string literal name.',
									});
								}

								// Second argument should be the config object
								if (secondArg.type === 'ObjectExpression') {
									configObj = secondArg as ASTObjectExpression;

									// Extract description from config object
									for (const prop of configObj.properties) {
										if (
											prop.key.type === 'Identifier' &&
											prop.key.name === 'description'
										) {
											if (prop.value.type === 'Literal') {
												evalDescription = (prop.value as ASTLiteral).value;
											}
										}
									}
								}

								const finalName = evalName;

								logger.trace(
									`Found eval: ${finalName}${evalDescription ? ` - ${evalDescription}` : ''}`
								);
								const evalId = getEvalId(projectId, deploymentId, rel, finalName, version);

								// Generate stable evalId
								const effectiveAgentId = agentId || '';
								const stableEvalId = generateStableEvalId(
									projectId,
									effectiveAgentId,
									finalName
								);

								// Note: We no longer inject metadata into the AST since there's no metadata object
								// The runtime will generate IDs from the name parameter

								evals.push({
									filename: rel,
									id: evalId,
									version,
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
		throw new DuplicateNameError({
			filename,
			message:
				`Duplicate eval names found in ${rel}: ${duplicates.join(', ')}. ` +
				'Eval names must be unique within the same file to prevent ID collisions.',
		});
	}

	const newsource = generate(ast);
	logger.trace(`Parsed ${evals.length} eval(s) from ${filename}`);
	return [newsource, evals];
}

const InvalidExportError = StructuredError('InvalidExportError')<{ filename: string }>();

export async function parseAgentMetadata(
	rootDir: string,
	filename: string,
	contents: string,
	projectId: string,
	deploymentId: string
): Promise<[string, Map<string, string>] | undefined> {
	// Quick string search optimization - skip AST parsing if no createAgent call
	if (!contents.includes('createAgent')) {
		return undefined;
	}

	const ast = acornLoose.parse(contents, {
		locations: true,
		ecmaVersion: 'latest',
		sourceType: 'module',
	});
	let exportName: string | undefined;
	const rel = relative(rootDir, filename);
	let name: string | undefined; // Will be set from createAgent identifier
	const version = hash(contents);
	const id = getAgentId(projectId, deploymentId, rel, version);

	let result: [string, Map<string, string>] | undefined;
	let schemaCodeExtracted = false;

	for (const body of ast.body) {
		if (body.type === 'ExportDefaultDeclaration') {
			if (body.declaration?.type === 'CallExpression') {
				const call = body.declaration as ASTCallExpression;
				if (call.callee.name === 'createAgent') {
					// Enforce new API: createAgent('name', {config})
					if (call.arguments.length < 2) {
						throw new Error(
							`createAgent requires 2 arguments: createAgent('name', config) in ${filename}`
						);
					}

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const nameArg = call.arguments[0] as any;
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const configArg = call.arguments[1] as any;

					if (!nameArg || nameArg.type !== 'Literal' || typeof nameArg.value !== 'string') {
						throw new Error(
							`createAgent first argument must be a string literal in ${filename}`
						);
					}

					if (!isObjectExpression(configArg)) {
						throw new Error(
							`createAgent second argument must be a config object in ${filename}`
						);
					}

					// Extract agent identifier from createAgent first argument
					name = nameArg.value;

					const callargexp = configArg;

					// Extract schema code before processing metadata
					let inputSchemaCode: string | undefined;
					let outputSchemaCode: string | undefined;
					if (!schemaCodeExtracted) {
						const schemaCode = extractSchemaCode(callargexp);
						inputSchemaCode = schemaCode.inputSchemaCode;
						outputSchemaCode = schemaCode.outputSchemaCode;
						schemaCodeExtracted = true;
					}

					for (const prop of callargexp.properties) {
						if (prop.key.type === 'Identifier' && prop.key.name === 'metadata') {
							result = augmentAgentMetadataNode(
								projectId,
								id,
								rel,
								version,
								ast,
								prop.value as ASTObjectExpression,
								filename,
								inputSchemaCode,
								outputSchemaCode
							);
							break;
						}
					}
					if (!result && name) {
						result = createAgentMetadataNode(
							id,
							name,
							rel,
							version,
							ast,
							callargexp,
							filename,
							projectId,
							inputSchemaCode,
							outputSchemaCode
						);
					}
					break;
				}
			}
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (!result && (body as any).declaration?.type === 'Identifier') {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const identifier = (body as any).declaration as ASTNodeIdentifier;
			exportName = identifier.name;
			break;
		}
	}
	// If no default export or createAgent found, skip this file (it's not an agent)
	if (!result && !exportName) {
		return undefined;
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
									// Enforce new API: createAgent('name', {config})
									if (call.arguments.length < 2) {
										throw new Error(
											`createAgent requires 2 arguments: createAgent('name', config) in ${filename}`
										);
									}

									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									const nameArg = call.arguments[0] as any;
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									const configArg = call.arguments[1] as any;

									if (
										!nameArg ||
										nameArg.type !== 'Literal' ||
										typeof nameArg.value !== 'string'
									) {
										throw new Error(
											`createAgent first argument must be a string literal in ${filename}`
										);
									}

									if (!isObjectExpression(configArg)) {
										throw new Error(
											`createAgent second argument must be a config object in ${filename}`
										);
									}

									// Extract agent identifier from createAgent first argument
									name = nameArg.value;

									const callargexp = configArg;

									// Extract schema code before processing metadata
									let inputSchemaCode: string | undefined;
									let outputSchemaCode: string | undefined;
									if (!schemaCodeExtracted) {
										const schemaCode = extractSchemaCode(callargexp);
										inputSchemaCode = schemaCode.inputSchemaCode;
										outputSchemaCode = schemaCode.outputSchemaCode;
										schemaCodeExtracted = true;
									}

									for (const prop of callargexp.properties) {
										if (prop.key.type === 'Identifier' && prop.key.name === 'metadata') {
											result = augmentAgentMetadataNode(
												projectId,
												id,
												rel,
												version,
												ast,
												prop.value as ASTObjectExpression,
												filename,
												inputSchemaCode,
												outputSchemaCode
											);
											break;
										}
									}
									if (!result && name) {
										result = createAgentMetadataNode(
											id,
											name,
											rel,
											version,
											ast,
											callargexp,
											filename,
											projectId,
											inputSchemaCode,
											outputSchemaCode
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
	// If no createAgent found after checking all declarations, skip this file
	if (!result) {
		return undefined;
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

const InvalidCreateRouterError = StructuredError('InvalidCreateRouterError')<{
	filename: string;
}>();

const InvalidRouterConfigError = StructuredError('InvalidRouterConfigError')<{
	filename: string;
	line?: number;
}>();

/**
 * Check if an AST node contains a validator() call
 */
interface ValidatorInfo {
	hasValidator: boolean;
	agentVariable?: string;
	inputSchemaVariable?: string;
	outputSchemaVariable?: string;
}

function hasValidatorCall(args: unknown[]): ValidatorInfo {
	if (!args || args.length === 0) return { hasValidator: false };

	for (const arg of args) {
		if (!arg || typeof arg !== 'object') continue;
		const node = arg as ASTNode;

		// Check if this is a CallExpression with callee named 'validator'
		if (node.type === 'CallExpression') {
			const callExpr = node as ASTCallExpression;

			// Check for standalone validator({ input, output })
			if (callExpr.callee.type === 'Identifier') {
				const identifier = callExpr.callee as ASTNodeIdentifier;
				if (identifier.name === 'validator') {
					// Try to extract schema variables from validator({ input, output })
					const schemas = extractValidatorSchemas(callExpr);
					return { hasValidator: true, ...schemas };
				}
				// Check for zValidator('json', schema)
				if (identifier.name === 'zValidator') {
					const schemas = extractZValidatorSchema(callExpr);
					return { hasValidator: true, ...schemas };
				}
			}

			// Check for agent.validator()
			if (callExpr.callee.type === 'MemberExpression') {
				const member = callExpr.callee as ASTMemberExpression;
				if (member.property && (member.property as ASTNodeIdentifier).name === 'validator') {
					// Extract agent variable name (the object before .validator())
					const agentVariable =
						member.object.type === 'Identifier'
							? (member.object as ASTNodeIdentifier).name
							: undefined;
					// Also check for schema overrides: agent.validator({ input, output })
					const schemas = extractValidatorSchemas(callExpr);
					return { hasValidator: true, agentVariable, ...schemas };
				}
			}
		}
	}

	return { hasValidator: false };
}

/**
 * Extract schema variable names from validator() call arguments
 * Example: validator({ input: myInputSchema, output: myOutputSchema })
 */
function extractValidatorSchemas(callExpr: ASTCallExpression): {
	inputSchemaVariable?: string;
	outputSchemaVariable?: string;
} {
	const result: { inputSchemaVariable?: string; outputSchemaVariable?: string } = {};

	// Check if validator has arguments
	if (!callExpr.arguments || callExpr.arguments.length === 0) {
		return result;
	}

	// First argument should be an object expression
	const firstArg = callExpr.arguments[0] as ASTNode;
	if (!firstArg || firstArg.type !== 'ObjectExpression') {
		return result;
	}

	const objExpr = firstArg as ASTObjectExpression;
	for (const prop of objExpr.properties) {
		const keyName = prop.key.name;
		if ((keyName === 'input' || keyName === 'output') && prop.value.type === 'Identifier') {
			const valueName = (prop.value as ASTNodeIdentifier).name;
			if (keyName === 'input') {
				result.inputSchemaVariable = valueName;
			} else {
				result.outputSchemaVariable = valueName;
			}
		}
	}

	return result;
}

/**
 * Extract schema from zValidator() call arguments
 * Example: zValidator('json', mySchema) or zValidator('json', z.object({...}))
 * Returns the schema as inputSchemaVariable since zValidator is for request body validation
 * Only extracts schemas for 'json' target, not 'query', 'param', 'header', or 'cookie'
 */
function extractZValidatorSchema(callExpr: ASTCallExpression): {
	inputSchemaVariable?: string;
} {
	const result: { inputSchemaVariable?: string } = {};

	// zValidator requires at least 2 arguments: zValidator(target, schema)
	if (!callExpr.arguments || callExpr.arguments.length < 2) {
		return result;
	}

	// First argument should be 'json' literal
	const targetArg = callExpr.arguments[0] as ASTNode;
	if (targetArg.type === 'Literal') {
		const targetValue = (targetArg as ASTLiteral).value;
		// Only extract schemas for JSON body validation
		if (targetValue !== 'json') {
			return result;
		}
	} else {
		// If first arg is not a literal, we can't determine the target, skip
		return result;
	}

	// Second argument is the schema
	const schemaArg = callExpr.arguments[1] as ASTNode;

	// If it's an identifier (variable reference), extract the name
	if (schemaArg.type === 'Identifier') {
		result.inputSchemaVariable = (schemaArg as ASTNodeIdentifier).name;
	}
	// If it's inline schema (CallExpression like z.object({...})), we detect but don't extract yet
	// TODO: Extract inline schema code

	return result;
}

export async function parseRoute(
	rootDir: string,
	filename: string,
	projectId: string,
	deploymentId: string
): Promise<BuildMetadata['routes']> {
	const rawContents = await Bun.file(filename).text();
	const version = hash(rawContents);
	// Transpile TypeScript to JavaScript so acorn-loose can parse it properly
	const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
	const contents = transpiler.transformSync(rawContents);
	const ast = acornLoose.parse(contents, {
		locations: true,
		ecmaVersion: 'latest',
		sourceType: 'module',
	});
	let exportName: string | undefined;
	let variableName: string | undefined;

	// Extract import statements to map variable names to their import sources
	const importMap = new Map<string, string>(); // Maps variable name to import path
	for (const body of ast.body) {
		if (body.type === 'ImportDeclaration') {
			const importDecl = body as {
				source?: { value?: string };
				specifiers?: Array<{
					type: string;
					local?: { name?: string };
				}>;
			};
			const importPath = importDecl.source?.value;
			if (importPath && importDecl.specifiers) {
				for (const spec of importDecl.specifiers) {
					if (spec.type === 'ImportDefaultSpecifier' && spec.local?.name) {
						// import hello from '@agent/hello'
						importMap.set(spec.local.name, importPath);
					} else if (spec.type === 'ImportSpecifier' && spec.local?.name) {
						// import { hello } from './shared'
						importMap.set(spec.local.name, importPath);
					}
				}
			}
		}
	}
	for (const body of ast.body) {
		if (body.type === 'ExportDefaultDeclaration') {
			const identifier = body.declaration as ASTNodeIdentifier;
			exportName = identifier.name;
			break;
		}
	}
	if (!exportName) {
		throw new InvalidExportError({
			filename,
			message: `could not find default export for ${filename} using ${rootDir}`,
		});
	}
	for (const body of ast.body) {
		if (body.type === 'VariableDeclaration') {
			for (const vardecl of body.declarations) {
				if (vardecl.type === 'VariableDeclarator' && vardecl.id.type === 'Identifier') {
					const identifier = vardecl.id as ASTNodeIdentifier;
					if (identifier.name === exportName) {
						if (vardecl.init?.type === 'CallExpression') {
							const call = vardecl.init as ASTCallExpression;
							// Support both createRouter() and new Hono()
							if (call.callee.name === 'createRouter') {
								variableName = identifier.name;
								break;
							}
						} else if (vardecl.init?.type === 'NewExpression') {
							const newExpr = vardecl.init as ASTCallExpression;
							// Support new Hono() pattern
							if (newExpr.callee.name === 'Hono') {
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
		throw new InvalidCreateRouterError({
			filename,
			message: `error parsing: ${filename}. could not find an proper createRouter or new Hono() defined in this file`,
		});
	}

	const rel = relative(rootDir, filename);

	// For src/api/index.ts, we don't want to add the folder name since it's the root API router
	const isRootApi = filename.includes('src/api/index.ts');

	// For nested routes, use the full path from src/api/ instead of just the immediate parent
	// e.g., src/api/v1/users/route.ts -> routeName = "v1/users"
	//       src/api/auth/route.ts -> routeName = "auth"
	//       src/api/test.ts -> routeName = "" (file directly in src/api/)
	let routeName = '';
	if (!isRootApi) {
		const apiMatch = filename.match(/src\/api\/(.+?)\/[^/]+\.ts$/);
		if (apiMatch) {
			// File in subdirectory: src/api/auth/route.ts -> "auth"
			routeName = apiMatch[1];
		}
		// For files directly in src/api/ (e.g., test.ts), routeName stays empty
		// This prevents double /api prefix since these files often define full paths
	}

	const routes: RouteDefinition = [];
	const routePrefix = '/api';

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
									throw new InvalidRouterConfigError({
										filename,
										line: body.loc?.start?.line,
										message: `unsupported HTTP method ${method} in ${filename} at line ${body.loc?.start?.line}`,
									});
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
									const expression = theaction.value;
									try {
										parseCronExpression(expression, { hasSeconds: false });
									} catch (ex) {
										throw new InvalidRouterConfigError({
											filename,
											cause: ex,
											line: body.loc?.start?.line,
											message: `invalid cron expression "${expression}" in ${filename} at line ${body.loc?.start?.line}`,
										});
									}
									suffix = hash(expression);
									config = { expression };
									break;
								}
								break;
							}
							default: {
								throw new InvalidRouterConfigError({
									filename,
									line: body.loc?.start?.line,
									message: `unsupported router method ${method} in ${filename} at line ${body.loc?.start?.line}`,
								});
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

						// Check if this route uses validator middleware
						const validatorInfo = hasValidatorCall(statement.expression.arguments);

						// Store validator info in config if present
						const routeConfig = config ? { ...config } : {};
						if (validatorInfo.hasValidator) {
							routeConfig.hasValidator = true;
							if (validatorInfo.agentVariable) {
								routeConfig.agentVariable = validatorInfo.agentVariable;
								// Look up where this agent variable is imported from
								const agentImportPath = importMap.get(validatorInfo.agentVariable);
								if (agentImportPath) {
									routeConfig.agentImportPath = agentImportPath;
								}
							}
							if (validatorInfo.inputSchemaVariable) {
								routeConfig.inputSchemaVariable = validatorInfo.inputSchemaVariable;
							}
							if (validatorInfo.outputSchemaVariable) {
								routeConfig.outputSchemaVariable = validatorInfo.outputSchemaVariable;
							}
						}

						routes.push({
							id,
							method: method as 'get' | 'post' | 'put' | 'delete' | 'patch',
							type: type as 'api' | 'sms' | 'email' | 'cron',
							filename: rel,
							path: thepath,
							version,
							config: Object.keys(routeConfig).length > 0 ? routeConfig : undefined,
						});
					}
				}
			}
		}
	} catch (error) {
		if (error instanceof InvalidRouterConfigError) {
			throw error;
		}
		throw new InvalidRouterConfigError({
			filename,
			cause: error,
		});
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
 * Extract AppState type from setup() return value in createApp call
 *
 * @param content - The TypeScript source code from app.ts
 * @returns Type definition string or null if no setup found
 */
export function extractAppStateType(content: string): string | null {
	try {
		const sourceFile = ts.createSourceFile('app.ts', content, ts.ScriptTarget.Latest, true);
		let appStateType: string | null = null;
		let foundCreateApp = false;
		let foundSetup = false;

		function visitNode(node: ts.Node): void {
			// Look for createApp call expression (can be on await expression)
			let callExpr: ts.CallExpression | undefined;

			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
				if (node.expression.text === 'createApp') {
					foundCreateApp = true;
					callExpr = node;
				}
			} else if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
				const call = node.expression;
				if (ts.isIdentifier(call.expression) && call.expression.text === 'createApp') {
					foundCreateApp = true;
					callExpr = call;
				}
			}

			if (callExpr) {
				// Check if it has a config object argument
				if (callExpr.arguments.length > 0) {
					const configArg = callExpr.arguments[0];
					if (ts.isObjectLiteralExpression(configArg)) {
						// Find setup property
						for (const prop of configArg.properties) {
							if (
								ts.isPropertyAssignment(prop) &&
								ts.isIdentifier(prop.name) &&
								prop.name.text === 'setup'
							) {
								foundSetup = true;
								// Found setup function - extract return type
								const setupFunc = prop.initializer;
								if (ts.isFunctionExpression(setupFunc) || ts.isArrowFunction(setupFunc)) {
									// Find return statement
									const returnObj = findReturnObject(setupFunc);
									if (returnObj) {
										appStateType = objectLiteralToTypeDefinition(returnObj, sourceFile);
									} else {
										logger.debug('No return object found in setup function');
									}
								} else {
									logger.debug(
										`Setup is not a function expression or arrow function, it's: ${ts.SyntaxKind[setupFunc.kind]}`
									);
								}
							}
						}
					}
				}
			}

			ts.forEachChild(node, visitNode);
		}

		function findReturnObject(
			func: ts.FunctionExpression | ts.ArrowFunction
		): ts.ObjectLiteralExpression | null {
			let returnObject: ts.ObjectLiteralExpression | null = null;

			function visitFuncNode(node: ts.Node): void {
				if (ts.isReturnStatement(node) && node.expression) {
					// Handle direct object literal
					if (ts.isObjectLiteralExpression(node.expression)) {
						returnObject = node.expression;
					}
					// Handle variable reference (const state = {...}; return state;)
					else if (ts.isIdentifier(node.expression)) {
						// Try to find the variable declaration
						const varName = node.expression.text;
						// Walk back through the function to find the declaration
						findVariableDeclaration(func.body!, varName);
					}
				}
				ts.forEachChild(node, visitFuncNode);
			}

			function findVariableDeclaration(body: ts.Node, varName: string): void {
				function visitForVar(node: ts.Node): void {
					if (ts.isVariableStatement(node)) {
						for (const decl of node.declarationList.declarations) {
							if (ts.isIdentifier(decl.name) && decl.name.text === varName) {
								if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
									returnObject = decl.initializer;
								}
							}
						}
					}
					ts.forEachChild(node, visitForVar);
				}
				visitForVar(body);
			}

			if (func.body) {
				visitFuncNode(func.body);
			}

			return returnObject;
		}

		function objectLiteralToTypeDefinition(
			obj: ts.ObjectLiteralExpression,
			sourceFile: ts.SourceFile
		): string {
			const properties: string[] = [];

			for (const prop of obj.properties) {
				if (ts.isPropertyAssignment(prop)) {
					const name = prop.name.getText(sourceFile);
					const value = prop.initializer;
					const typeStr = inferTypeFromValue(value, sourceFile);
					properties.push(`\t${name}: ${typeStr};`);
				} else if (ts.isShorthandPropertyAssignment(prop)) {
					const name = prop.name.getText(sourceFile);
					properties.push(`\t${name}: unknown;`);
				}
			}

			return `{\n${properties.join('\n')}\n}`;
		}

		function inferTypeFromValue(value: ts.Expression, sourceFile: ts.SourceFile): string {
			if (ts.isStringLiteral(value)) {
				return 'string';
			}
			if (ts.isNumericLiteral(value)) {
				return 'number';
			}
			if (
				value.kind === ts.SyntaxKind.TrueKeyword ||
				value.kind === ts.SyntaxKind.FalseKeyword
			) {
				return 'boolean';
			}
			if (ts.isNewExpression(value) && ts.isIdentifier(value.expression)) {
				if (value.expression.text === 'Date') {
					return 'Date';
				}
			}
			if (ts.isObjectLiteralExpression(value)) {
				return objectLiteralToTypeDefinition(value, sourceFile);
			}
			if (ts.isArrayLiteralExpression(value)) {
				return 'unknown[]';
			}
			return 'unknown';
		}

		visitNode(sourceFile);

		if (!foundCreateApp) {
			logger.debug('Did not find createApp call in app.ts');
		} else if (!foundSetup) {
			logger.debug('Found createApp but no setup property');
		} else if (!appStateType) {
			logger.debug('Found createApp and setup but could not extract type');
		}

		return appStateType;
	} catch (error) {
		logger.warn('AppState type extraction failed:', error);
		return null;
	}
}

/**
 * Update tsconfig.json to add path mapping for @agentuity/runtime
 *
 * @param rootDir - Root directory of the project
 * @param shouldAdd - If true, add the mapping; if false, remove it
 */
async function updateTsconfigPathMapping(rootDir: string, shouldAdd: boolean): Promise<void> {
	const tsconfigPath = join(rootDir, 'tsconfig.json');

	if (!(await Bun.file(tsconfigPath).exists())) {
		logger.debug('No tsconfig.json found, skipping path mapping update');
		return;
	}

	try {
		const tsconfigContent = await Bun.file(tsconfigPath).text();

		// Use JSON5 to parse tsconfig.json (handles comments in input)
		const tsconfig = JSON5.parse(tsconfigContent);
		const _before = JSON.stringify(tsconfig);

		// Initialize compilerOptions and paths if they don't exist
		if (!tsconfig.compilerOptions) {
			tsconfig.compilerOptions = {};
		}
		if (!tsconfig.compilerOptions.paths) {
			tsconfig.compilerOptions.paths = {};
		}

		if (shouldAdd) {
			// Add or update the path mapping
			tsconfig.compilerOptions.paths['@agentuity/runtime'] = [
				'./.agentuity/.agentuity_runtime.ts',
			];

			// Ensure .agentuity_types.ts is included so module augmentation works
			if (!tsconfig.include) {
				tsconfig.include = [];
			}
			if (!tsconfig.include.includes('.agentuity/.agentuity_types.ts')) {
				tsconfig.include.push('.agentuity/.agentuity_types.ts');
			}

			logger.debug('Added @agentuity/runtime path mapping to tsconfig.json');
		} else {
			// Remove the path mapping if it exists
			if (tsconfig.compilerOptions.paths['@agentuity/runtime']) {
				delete tsconfig.compilerOptions.paths['@agentuity/runtime'];
				logger.debug('Removed @agentuity/runtime path mapping from tsconfig.json');
			}

			// Clean up empty paths object
			if (Object.keys(tsconfig.compilerOptions.paths).length === 0) {
				delete tsconfig.compilerOptions.paths;
			}
		}

		const _after = JSON.stringify(tsconfig);
		if (_before === _after) {
			return;
		}

		// Write back using standard JSON (TypeScript requires strict JSON format)
		await Bun.write(tsconfigPath, JSON.stringify(tsconfig, null, '\t') + '\n');
	} catch (error) {
		logger.warn('Failed to update tsconfig.json:', error);
	}
}

const RuntimePackageNotFound = StructuredError('RuntimePackageNotFound');

/**
 * Generate lifecycle type files (.agentuity/types.ts and .agentuity/.agentuity_runtime.ts)
 *
 * @param rootDir - Root directory of the project
 * @param appFilePath - Path to app.ts file
 * @returns true if files were generated, false if no setup found
 */
export async function generateLifecycleTypes(
	rootDir: string,
	outDir: string,
	appFilePath: string
): Promise<boolean> {
	const appContent = await Bun.file(appFilePath).text();
	if (typeof appContent !== 'string') {
		return false;
	}

	const appStateType = extractAppStateType(appContent as string);

	if (!appStateType) {
		logger.debug('No setup() function found in app.ts, skipping lifecycle type generation');
		// Remove path mapping if no setup found
		await updateTsconfigPathMapping(rootDir, false);
		return false;
	}

	const agentuityDir = join(rootDir, '.agentuity');

	// Ensure .agentuity directory exists
	if (!existsSync(agentuityDir)) {
		mkdirSync(agentuityDir, { recursive: true });
	}

	// First, determine the runtime package location
	// Try multiple locations: app-level node_modules, then monorepo root
	const appLevelPath = join(rootDir, 'node_modules', '@agentuity', 'runtime');
	// From apps/testing/auth-app to monorepo root is 3 levels up (../../..)
	const rootLevelPath = join(rootDir, '..', '..', '..', 'node_modules', '@agentuity', 'runtime');

	let runtimePkgPath: string;
	if (existsSync(appLevelPath)) {
		runtimePkgPath = appLevelPath;
		logger.debug(`Found runtime package at app level: ${appLevelPath}`);
	} else if (existsSync(rootLevelPath)) {
		runtimePkgPath = rootLevelPath;
		logger.debug(`Found runtime package at root level: ${rootLevelPath}`);
	} else {
		throw new RuntimePackageNotFound({
			message:
				`@agentuity/runtime package not found in:\n` +
				`  - ${appLevelPath}\n` +
				`  - ${rootLevelPath}\n` +
				`Make sure dependencies are installed by running 'bun install' or 'npm install'`,
		});
	}

	let runtimeImportPath: string | null = null;

	// Calculate relative path from .agentuity/ to the package location
	// Don't resolve symlinks - we want to use the symlink path so it works in both
	// local dev (symlinked to packages/) and CI (actual node_modules)
	if (existsSync(runtimePkgPath)) {
		// Calculate relative path from .agentuity/ to node_modules package
		const relPath = relative(agentuityDir, runtimePkgPath);
		runtimeImportPath = relPath;
		logger.debug(`Using relative path to runtime package: ${relPath}`);
	} else {
		throw new RuntimePackageNotFound({
			message:
				`Failed to access @agentuity/runtime package at ${runtimePkgPath}\n` +
				`Make sure dependencies are installed`,
		});
	}

	if (!runtimeImportPath) {
		throw new RuntimePackageNotFound({
			message: `Failed to determine import path for @agentuity/runtime`,
		});
	}

	// Now generate .agentuity_types.ts
	// NOTE: We can ONLY augment the package name, not relative paths
	// TypeScript resolves @agentuity/runtime through path mapping -> wrapper -> actual package
	const typesContent = `// AUTO-GENERATED from app.ts setup() return type
// This file is auto-generated by the build tool - do not edit manually

/**
 * Application state type inferred from your createApp setup function.
 * This type is automatically generated and available throughout your app via ctx.app.
 *
 * @example
 * \`\`\`typescript
 * // In your agents:
 * const agent = createAgent({
 *   handler: async (ctx, input) => {
 *     // ctx.app is strongly typed as GeneratedAppState
 *     const value = ctx.app; // All properties from your setup return value
 *     return 'result';
 *   }
 * });
 * \`\`\`
 */
export type GeneratedAppState = ${appStateType};

// Augment the @agentuity/runtime module with AppState
// This will be picked up when imported through the wrapper
declare module '@agentuity/runtime' {
	interface AppState extends GeneratedAppState {}
}
`;
	const typesPath = join(outDir, '.agentuity_types.ts');
	await Bun.write(typesPath, typesContent);
	logger.debug(`Generated lifecycle types: ${typesPath}`);

	const wrapperContent = `// AUTO-GENERATED runtime wrapper
// This file is auto-generated by the build tool - do not edit manually

// Import augmentations file (NOT type-only) to trigger module augmentation
import type { GeneratedAppState } from './.agentuity_types';
import './.agentuity_types';

// Import from actual package location
import { createRouter as baseCreateRouter, type Env } from '${runtimeImportPath}/src/index';
import type { Hono } from 'hono';

// Type aliases to avoid repeating the generic parameter
type AppEnv = Env<GeneratedAppState>;
type AppRouter = Hono<AppEnv>;

/**
 * Creates a Hono router with extended methods for Agentuity-specific routing patterns.
 *
 * In addition to standard HTTP methods (get, post, put, delete, patch), the router includes:
 * - **stream()** - Stream responses with ReadableStream
 * - **websocket()** - WebSocket connections
 * - **sse()** - Server-Sent Events
 * - **email()** - Email handler routing
 * - **sms()** - SMS handler routing
 * - **cron()** - Scheduled task routing
 *
 * @returns Extended Hono router with custom methods and app state typing
 *
 * @example
 * \`\`\`typescript
 * const router = createRouter();
 *
 * // Standard HTTP routes
 * router.get('/hello', (c) => c.text('Hello!'));
 * router.post('/data', async (c) => {
 *   const body = await c.req.json();
 *   return c.json({ received: body });
 * });
 *
 * // Access app state (strongly typed!)
 * router.get('/db', (c) => {
 *   const db = c.var.app; // Your app state from createApp setup
 *   return c.json({ connected: true });
 * });
 * \`\`\`
 */
export function createRouter(): AppRouter {
	return baseCreateRouter() as any;
}

// Re-export everything else
export * from '${runtimeImportPath}/src/index';
`;
	const wrapperPath = join(outDir, '.agentuity_runtime.ts');
	await Bun.write(wrapperPath, wrapperContent);
	logger.debug(`Generated lifecycle wrapper: ${wrapperPath}`);

	// Update tsconfig.json with path mapping
	await updateTsconfigPathMapping(rootDir, true);

	return true;
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
			config = { route: '/workbench', headers: {}, port: 3500 };
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

/**
 * Find the end position of createApp call statement in the source code
 * Uses AST parsing to reliably find the complete statement including await/const assignment
 *
 * @param content - The source code content
 * @returns The character position after the createApp statement, or -1 if not found
 */
export function findCreateAppEndPosition(content: string): number {
	try {
		const ast = acornLoose.parse(content, {
			ecmaVersion: 'latest',
			sourceType: 'module',
		}) as ASTProgram;

		// Walk through all top-level statements
		for (const node of ast.body) {
			let targetNode: ASTNode | undefined;

			// Check for: const app = await createApp(...)
			if (node.type === 'VariableDeclaration') {
				const varDecl = node as unknown as { declarations: ASTVariableDeclarator[] };
				for (const declarator of varDecl.declarations) {
					if (declarator.init) {
						// Handle await createApp(...)
						if (declarator.init.type === 'AwaitExpression') {
							const awaitExpr = declarator.init as unknown as {
								argument: ASTCallExpression;
							};
							if (
								awaitExpr.argument?.type === 'CallExpression' &&
								isCreateAppCall(awaitExpr.argument)
							) {
								targetNode = node;
								break;
							}
						}
						// Handle createApp(...) without await
						else if (declarator.init.type === 'CallExpression') {
							if (isCreateAppCall(declarator.init as ASTCallExpression)) {
								targetNode = node;
								break;
							}
						}
					}
				}
			}
			// Check for: await createApp(...)
			else if (node.type === 'ExpressionStatement') {
				const exprStmt = node as ASTExpressionStatement;
				if (exprStmt.expression.type === 'AwaitExpression') {
					const awaitExpr = exprStmt.expression as unknown as { argument: ASTCallExpression };
					if (
						awaitExpr.argument?.type === 'CallExpression' &&
						isCreateAppCall(awaitExpr.argument)
					) {
						targetNode = node;
					}
				} else if (exprStmt.expression.type === 'CallExpression') {
					if (isCreateAppCall(exprStmt.expression as ASTCallExpression)) {
						targetNode = node;
					}
				}
			}

			if (targetNode && targetNode.end !== undefined) {
				// Find the semicolon after the statement (if it exists)
				const afterStmt = content.slice(targetNode.end);
				const semiMatch = afterStmt.match(/^\s*;/);
				if (semiMatch) {
					return targetNode.end + semiMatch[0].length;
				}
				// No semicolon, return end of statement
				return targetNode.end;
			}
		}

		return -1;
	} catch (error) {
		logger.warn('Failed to parse AST for createApp detection:', error);
		return -1;
	}
}

/**
 * Check if a CallExpression is a call to createApp
 */
function isCreateAppCall(node: ASTCallExpression): boolean {
	const callee = node.callee;
	if (callee.type === 'Identifier') {
		const id = callee as ASTNodeIdentifier;
		return id.name === 'createApp';
	}
	return false;
}
