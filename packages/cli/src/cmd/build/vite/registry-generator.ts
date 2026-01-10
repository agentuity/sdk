/**
 * Registry Generator
 *
 * Generates src/generated/registry.ts from discovered agents
 */

import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { StructuredError } from '@agentuity/core';
import { toCamelCase, toPascalCase } from '../../../utils/string';
import type { AgentMetadata } from './agent-discovery';
import type { RouteInfo } from './route-discovery';

const AgentIdentifierCollisionError = StructuredError('AgentIdentifierCollisionError');

/**
 * Regex to strip route parameter characters that produce invalid TypeScript property names:
 * - Leading : (path parameters, e.g., :id)
 * - Leading * (wildcard routes, e.g., *path)
 * - Trailing ?, +, * (optional/one-or-more/wildcard modifiers, e.g., :userId?)
 */
const ROUTE_PARAM_CHARS = /^[:*]|[?+*]$/g;

/**
 * Sanitize a route path segment for use as a TypeScript property name.
 * Strips route parameter characters and converts to camelCase.
 */
function sanitizePathSegment(segment: string): string {
	return toCamelCase(segment.replace(ROUTE_PARAM_CHARS, ''));
}

/**
 * Generate TypeScript type for path parameters.
 * Returns 'never' if no path params, or '{ param1: string; param2: string }' format.
 */
function generatePathParamsType(pathParams?: string[]): string {
	if (!pathParams || pathParams.length === 0) {
		return 'never';
	}
	return `{ ${pathParams.map((p) => `${p}: string`).join('; ')} }`;
}

/**
 * Generate TypeScript tuple type for path parameters (for positional args).
 * Returns '[]' if no path params, or '[string, string]' format.
 */
function generatePathParamsTupleType(pathParams?: string[]): string {
	if (!pathParams || pathParams.length === 0) {
		return '[]';
	}
	return `[${pathParams.map(() => 'string').join(', ')}]`;
}

/**
 * Generate src/generated/registry.ts with agent registry and types
 */
export function generateAgentRegistry(srcDir: string, agents: AgentMetadata[]): void {
	const generatedDir = join(srcDir, 'generated');
	const registryPath = join(generatedDir, 'registry.ts');

	// Sort agents by name for deterministic output
	const sortedAgents = [...agents].sort((a, b) => a.name.localeCompare(b.name));

	// Detect naming collisions in generated identifiers
	const generatedNames = new Set<string>();
	const collisions: string[] = [];

	for (const agent of sortedAgents) {
		const camelName = toCamelCase(agent.name);

		if (generatedNames.has(camelName)) {
			collisions.push(`Identifier collision detected: "${camelName}" (from "${agent.name}")`);
		}
		generatedNames.add(camelName);
	}

	if (collisions.length > 0) {
		throw new AgentIdentifierCollisionError({
			message:
				`Agent identifier naming collisions detected:\n${collisions.join('\n')}\n\n` +
				`This occurs when different agent names produce the same camelCase identifier.\n` +
				`Please rename your agents to avoid this collision.`,
		});
	}

	// Collect eval files that need to be imported for createEval calls to run
	// These are eval.ts files in the same directory as agents that have evals
	const evalImports: string[] = [];
	const seenEvalPaths = new Set<string>();

	for (const agent of sortedAgents) {
		if (agent.evals && agent.evals.length > 0) {
			// Check if any eval comes from a separate eval.ts file (not the agent file itself)
			for (const evalMeta of agent.evals) {
				// Skip if eval is defined in the agent file itself
				if (evalMeta.filename === agent.filename) continue;

				// Build the relative path for the eval file
				let evalRelativePath = evalMeta.filename;
				if (evalRelativePath.startsWith('./agent/')) {
					evalRelativePath = evalRelativePath
						.replace(/^\.\/agent\//, '../agent/')
						.replace(/\.tsx?$/, '.js');
				} else if (evalRelativePath.startsWith('src/agent/')) {
					evalRelativePath = evalRelativePath
						.replace(/^src\/agent\//, '../agent/')
						.replace(/\.tsx?$/, '.js');
				} else if (evalRelativePath.includes('/src/agent/')) {
					// Handle absolute paths by extracting the relative part
					evalRelativePath = evalRelativePath
						.replace(/^.*\/src\/agent\//, '../agent/')
						.replace(/\.tsx?$/, '.js');
				}
				// Avoid duplicate imports
				if (!seenEvalPaths.has(evalRelativePath)) {
					seenEvalPaths.add(evalRelativePath);
					evalImports.push(`import '${evalRelativePath}';`);
				}
			}
		}
	}

	// Generate imports for all agents
	const imports = sortedAgents
		.map(({ name, filename }) => {
			const camelName = toCamelCase(name);
			// Handle both './agent/...' and 'src/agent/...' formats
			let relativePath = filename;
			if (relativePath.startsWith('./agent/')) {
				// ./agent/foo.ts -> ../agent/foo.js (use .js extension for TypeScript)
				relativePath = relativePath
					.replace(/^\.\/agent\//, '../agent/')
					.replace(/\.tsx?$/, '.js');
			} else if (relativePath.startsWith('src/agent/')) {
				// src/agent/foo.ts -> ../agent/foo.js (use .js extension for TypeScript)
				relativePath = relativePath
					.replace(/^src\/agent\//, '../agent/')
					.replace(/\.tsx?$/, '.js');
			}
			return `import ${camelName} from '${relativePath}';`;
		})
		.join('\n');

	// Generate schema type exports for all agents
	const schemaTypeExports = sortedAgents
		.map(({ name, description }) => {
			const camelName = toCamelCase(name);
			const pascalName = toPascalCase(name);
			const descComment = description ? `\n * ${description}` : '';

			const parts = [
				'',
				`/**`,
				` * Input type for ${name} agent${descComment}`,
				` */`,
				`export type ${pascalName}Input = InferInput<typeof ${camelName}['inputSchema']>;`,
				'',
				`/**`,
				` * Output type for ${name} agent${descComment}`,
				` */`,
				`export type ${pascalName}Output = InferOutput<typeof ${camelName}['outputSchema']>;`,
				'',
				`/**`,
				` * Input schema type for ${name} agent${descComment}`,
				` */`,
				`export type ${pascalName}InputSchema = typeof ${camelName}['inputSchema'];`,
				'',
				`/**`,
				` * Output schema type for ${name} agent${descComment}`,
				` */`,
				`export type ${pascalName}OutputSchema = typeof ${camelName}['outputSchema'];`,
				'',
				`/**`,
				` * Agent type for ${name}${descComment}`,
				` */`,
				`export type ${pascalName}Agent = AgentRunner<`,
				`\t${pascalName}InputSchema,`,
				`\t${pascalName}OutputSchema,`,
				`\ttypeof ${camelName}['stream'] extends true ? true : false`,
				`>;`,
			];
			return parts.join('\n');
		})
		.join('\n');

	// Generate flat registry structure with JSDoc
	const registry = sortedAgents
		.map(({ name, description }) => {
			const camelName = toCamelCase(name);
			const pascalName = toPascalCase(name);
			const descComment = description ? `\n\t * ${description}` : '';

			return `\t/**
\t * ${name}${descComment}
\t * @type {${pascalName}Agent}
\t */
\t${camelName},`;
		})
		.join('\n');

	// Generate flat agent type definitions for AgentRegistry interface augmentation
	// Uses the exported Agent types defined above
	const runtimeAgentTypes = sortedAgents
		.map(({ name }) => {
			const camelName = toCamelCase(name);
			const pascalName = toPascalCase(name);
			return `		${camelName}: ${pascalName}Agent;`;
		})
		.join('\n');

	// Build eval imports section (side-effect imports for createEval registration)
	const evalImportsSection =
		evalImports.length > 0
			? `
// Eval file imports (side-effect imports to register evals via createEval)
${evalImports.join('\n')}
`
			: '';

	const generatedContent = `// @generated
// Auto-generated by Agentuity - DO NOT EDIT
${imports}
import type { AgentRunner } from '@agentuity/runtime';
import type { InferInput, InferOutput } from '@agentuity/core';
${evalImportsSection}

// ============================================================================
// Schema Type Exports
// ============================================================================
${schemaTypeExports}

// ============================================================================
// Agent Definitions
// ============================================================================

/**
 * Agent Definitions
 * 
 * Registry of all agents in this application.
 * Provides strongly-typed access to agent metadata and runner functions.
 * 
 * @remarks
 * This object is auto-generated from your agent files during build.
 * Each agent has corresponding Input, Output, and Runner types exported above.
 * 
 * @example
 * \`\`\`typescript
 * import { AgentDefinitions, SessionBasicInput } from './generated/registry';
 * 
 * // Access agent definition
 * const agent = AgentDefinitions.sessionBasic;
 * 
 * // Use typed schema types
 * const input: SessionBasicInput = { ... };
 * const result = await agent.run(input);
 * \`\`\`
 */
export const AgentDefinitions = {
${registry}
} as const;

// ============================================================================
// Module Augmentation
// ============================================================================

// Augment @agentuity/runtime types with strongly-typed agents from this project
declare module "@agentuity/runtime" {
	// Augment the AgentRegistry interface with project-specific strongly-typed agents
	export interface AgentRegistry {
${runtimeAgentTypes}
	}
}

// FOUND AN ERROR IN THIS FILE?
// Please file an issue at https://github.com/agentuity/sdk/issues
// or if you know the fix please submit a PR!
`;

	const agentsDir = join(srcDir, 'agent');
	const legacyTypesPath = join(agentsDir, 'types.generated.d.ts');

	// Ensure src/generated directory exists
	if (!existsSync(generatedDir)) {
		mkdirSync(generatedDir, { recursive: true });
	}

	// Collapse 2+ consecutive empty lines into 1 empty line (3+ \n becomes 2 \n)
	const cleanedContent = generatedContent.replace(/\n{3,}/g, '\n\n');

	writeFileSync(registryPath, cleanedContent, 'utf-8');

	// Remove legacy types.generated.d.ts if it exists (legacy cleanup)
	if (existsSync(legacyTypesPath)) {
		unlinkSync(legacyTypesPath);
	}
}

/**
 * Helper function to generate RPC-style nested registry type.
 * Converts routes like "POST /api/hello" to nested structure: post.api.hello
 */
function generateRPCRegistryType(
	apiRoutes: RouteInfo[],
	websocketRoutes: RouteInfo[],
	sseRoutes: RouteInfo[],
	agentImports: Map<string, string>,
	_schemaImportAliases: Map<string, Map<string, string>>,
	agentMetadataMap: Map<string, AgentMetadata>
): string {
	// Build nested structure from routes
	interface NestedNode {
		[key: string]: NestedNode | { input: string; output: string; type: string; route: RouteInfo };
	}

	const tree: NestedNode = {};

	// Helper to add route to tree
	const addRoute = (route: RouteInfo, routeType: 'api' | 'websocket' | 'sse' | 'stream') => {
		const method = route.method.toLowerCase();

		// Strip /api prefix from path
		let cleanPath = route.path;
		if (cleanPath.startsWith('/api/')) {
			cleanPath = cleanPath.substring(4); // Remove '/api'
		} else if (cleanPath === '/api') {
			cleanPath = '/';
		}

		const pathParts = cleanPath.split('/').filter(Boolean);

		// Navigate/create tree structure: path segments first, then method
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let current: any = tree;

		// Add path segments - sanitize for valid TypeScript property names
		for (let i = 0; i < pathParts.length; i++) {
			const part = sanitizePathSegment(pathParts[i]);
			// Skip empty segments (e.g., wildcards like '*' that sanitize to '')
			if (!part) {
				continue;
			}
			if (!current[part]) {
				current[part] = {};
			}
			current = current[part];
		}

		// Determine terminal method name based on route type
		// For stream types (websocket, sse, stream), use the type name as the method
		// For regular API routes, use the HTTP method
		const terminalMethod =
			routeType === 'websocket'
				? 'websocket'
				: routeType === 'sse'
					? 'eventstream'
					: routeType === 'stream'
						? 'stream'
						: method;

		// Add method as final level with schema types
		const routeKey = `${route.method.toUpperCase()} ${route.path}`;
		const safeName = routeKey
			.replace(/[^a-zA-Z0-9]/g, '_')
			.replace(/^_+|_+$/g, '')
			.replace(/_+/g, '_');
		const pascalName = toPascalCase(safeName);

		// Only reference type names if route has actual schemas extracted, otherwise use 'never'
		// Note: hasValidator may be true (e.g., zValidator('query', ...)) but no schemas extracted
		// because only 'json' validators extract input schemas
		// Also check if agentVariable exists but import wasn't added (missing agentImportPath)
		const hasValidAgentImport = route.agentVariable
			? !!agentImports.get(route.agentVariable)
			: false;
		const hasSchemas =
			route.inputSchemaVariable || route.outputSchemaVariable || hasValidAgentImport;

		current[terminalMethod] = {
			input: hasSchemas ? `${pascalName}Input` : 'never',
			output: hasSchemas ? `${pascalName}Output` : 'never',
			type: `'${routeType}'`,
			route,
		};
	};

	// Add all routes with their types
	apiRoutes.forEach((route) => {
		const routeType = route.routeType === 'stream' ? 'stream' : 'api';
		addRoute(route, routeType);
	});
	websocketRoutes.forEach((route) => addRoute(route, 'websocket'));
	sseRoutes.forEach((route) => addRoute(route, 'sse'));

	// Convert tree to TypeScript type string
	function treeToTypeString(node: NestedNode, indent: string = '\t\t'): string {
		const lines: string[] = [];

		// Sort entries alphabetically for deterministic output
		const sortedEntries = Object.entries(node).sort(([a], [b]) => a.localeCompare(b));
		for (const [key, value] of sortedEntries) {
			if (
				value &&
				typeof value === 'object' &&
				'input' in value &&
				'output' in value &&
				'type' in value &&
				'route' in value
			) {
				// Leaf node with schema and type - add JSDoc
				const route = value.route;
				const jsdoc: string[] = [];

				// Access route info from value
				const routeInfo = route as RouteInfo;

				// Look up agent metadata
				let agentMeta: AgentMetadata | undefined;
				if (routeInfo.agentVariable) {
					agentMeta = agentMetadataMap.get(routeInfo.agentVariable);
				}

				// Build JSDoc comment
				jsdoc.push(`${indent}/**`);
				jsdoc.push(`${indent} * Route: ${routeInfo.method.toUpperCase()} ${routeInfo.path}`);
				if (agentMeta?.name) {
					jsdoc.push(`${indent} * @agent ${agentMeta.name}`);
				}
				if (agentMeta?.description) {
					jsdoc.push(`${indent} * @description ${agentMeta.description}`);
				}
				jsdoc.push(`${indent} */`);
				lines.push(...jsdoc);

				const pathParamsType = generatePathParamsType(routeInfo.pathParams);
				const pathParamsTupleType = generatePathParamsTupleType(routeInfo.pathParams);
				lines.push(
					`${indent}${key}: { input: ${value.input}; output: ${value.output}; type: ${value.type}; params: ${pathParamsType}; paramsTuple: ${pathParamsTupleType} };`
				);
			} else {
				// Nested node
				lines.push(`${indent}${key}: {`);
				lines.push(treeToTypeString(value as NestedNode, indent + '\t'));
				lines.push(`${indent}};`);
			}
		}

		return lines.join('\n');
	}

	if (Object.keys(tree).length === 0) {
		return '\t\t// No routes discovered';
	}

	return treeToTypeString(tree);
}

/**
 * Generate runtime metadata object for RPC routes.
 * This allows the client to know route types at runtime.
 */
function generateRPCRuntimeMetadata(
	apiRoutes: RouteInfo[],
	websocketRoutes: RouteInfo[],
	sseRoutes: RouteInfo[]
): string {
	interface MetadataNode {
		[key: string]: MetadataNode | { type: string; path: string; pathParams?: string[] };
	}

	const tree: MetadataNode = {};

	const addRoute = (route: RouteInfo, routeType: string) => {
		let cleanPath = route.path;
		if (cleanPath.startsWith('/api/')) {
			cleanPath = cleanPath.substring(4);
		} else if (cleanPath === '/api') {
			cleanPath = '/';
		}

		const pathParts = cleanPath.split('/').filter(Boolean);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let current: any = tree;

		// Sanitize path segments for valid property names (must match type generation)
		for (const part of pathParts) {
			const sanitized = sanitizePathSegment(part);
			// Skip empty segments (e.g., wildcards like '*' that sanitize to '')
			if (!sanitized) {
				continue;
			}
			if (!current[sanitized]) current[sanitized] = {};
			current = current[sanitized];
		}

		// Use terminal method name based on route type
		const terminalMethod =
			routeType === 'websocket'
				? 'websocket'
				: routeType === 'sse'
					? 'eventstream'
					: routeType === 'stream'
						? 'stream'
						: route.method.toLowerCase();

		const metadata: { type: string; path: string; pathParams?: string[] } = {
			type: routeType,
			path: route.path,
		};
		if (route.pathParams && route.pathParams.length > 0) {
			metadata.pathParams = route.pathParams;
		}
		current[terminalMethod] = metadata;
	};

	apiRoutes.forEach((r) => addRoute(r, r.routeType === 'stream' ? 'stream' : 'api'));
	websocketRoutes.forEach((r) => addRoute(r, 'websocket'));
	sseRoutes.forEach((r) => addRoute(r, 'sse'));

	// Sort object keys recursively for deterministic output
	const sortObject = (obj: MetadataNode): MetadataNode => {
		const sorted: MetadataNode = {};
		for (const key of Object.keys(obj).sort()) {
			const value = obj[key];
			if (value && typeof value === 'object' && !('type' in value)) {
				sorted[key] = sortObject(value as MetadataNode);
			} else {
				sorted[key] = value;
			}
		}
		return sorted;
	};

	return JSON.stringify(sortObject(tree), null, '\t\t');
}

/**
 * Generate RouteRegistry type definitions from discovered routes.
 *
 * Creates a module augmentation for @agentuity/react that provides
 * strongly-typed route keys with input/output schema information.
 */
export async function generateRouteRegistry(
	srcDir: string,
	routes: RouteInfo[],
	agents: AgentMetadata[] = []
): Promise<void> {
	const projectRoot = join(srcDir, '..');
	const packageJsonPath = join(projectRoot, 'package.json');
	let hasReactDependency = false;
	let hasFrontendDependency = false;

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
		hasReactDependency = !!(
			packageJson.dependencies?.['@agentuity/react'] ||
			packageJson.devDependencies?.['@agentuity/react']
		);
		hasFrontendDependency = !!(
			packageJson.dependencies?.['@agentuity/frontend'] ||
			packageJson.devDependencies?.['@agentuity/frontend']
		);
	} catch {
		// If we can't read package.json, assume no frontend dependencies
	}

	const webDir = join(srcDir, 'web');
	let hasWebDirectory = false;
	try {
		const webDirStat = await stat(webDir);
		hasWebDirectory = webDirStat.isDirectory();
	} catch {
		// Directory doesn't exist
	}

	const shouldEmitFrontendClient = hasFrontendDependency && !hasReactDependency && hasWebDirectory;

	// Filter routes by type and sort by path for deterministic output
	const sortByPath = (a: RouteInfo, b: RouteInfo) => a.path.localeCompare(b.path);
	const apiRoutes = routes
		.filter((r) => r.routeType === 'api' || r.routeType === 'stream')
		.sort(sortByPath);
	const websocketRoutes = routes.filter((r) => r.routeType === 'websocket').sort(sortByPath);
	const sseRoutes = routes.filter((r) => r.routeType === 'sse').sort(sortByPath);

	const allRoutes = [...apiRoutes, ...websocketRoutes, ...sseRoutes];

	// Create maps for agent metadata lookup
	const agentMetadataMap = new Map<string, AgentMetadata>();
	const agentNameMap = new Map<string, AgentMetadata>();

	// Map by agent name for easy lookup
	agents.forEach((agent) => {
		agentNameMap.set(agent.name, agent);
	});

	// Map agent import variables to metadata by extracting agent name from import path
	allRoutes.forEach((route) => {
		if (route.agentVariable && route.agentImportPath) {
			// Extract agent name from import path (e.g., "@agent/hello" -> "hello")
			const match = route.agentImportPath.match(/@agent[s]?\/([^/]+)/);
			if (match) {
				const agentName = match[1];
				const metadata = agentNameMap.get(agentName);
				if (metadata) {
					agentMetadataMap.set(route.agentVariable, metadata);
				}
			}
		}
	});

	if (apiRoutes.length === 0 && websocketRoutes.length === 0 && sseRoutes.length === 0) {
		return;
	}

	// Generate imports for agents and schemas
	const imports: string[] = [];
	const agentImports = new Map<string, string>();
	const routeFileImports = new Map<string, Set<string>>();

	// Collect agent and schema imports from routes with validators or exported schemas
	allRoutes.forEach((route) => {
		const hasSchemaVars = !!route.inputSchemaVariable || !!route.outputSchemaVariable;
		if (!route.hasValidator && !hasSchemaVars && !route.agentVariable) return;

		// Collect agent imports (when using agent.validator())
		if (
			route.hasValidator &&
			route.agentVariable &&
			route.agentImportPath &&
			!agentImports.has(route.agentVariable)
		) {
			let resolvedPath = route.agentImportPath;

			if (resolvedPath.startsWith('@agents/') || resolvedPath.startsWith('@agent/')) {
				// Handle both @agents/ and @agent/ aliases -> ../agent/
				const suffix = resolvedPath.startsWith('@agents/')
					? resolvedPath.substring('@agents/'.length)
					: resolvedPath.substring('@agent/'.length);

				// Convert @agent/hello -> ../agent/hello/index.js
				// Convert @agent/hello/agent -> ../agent/hello/agent.js
				if (!suffix.includes('/')) {
					// Bare module (e.g., @agent/hello) - add /index.js
					resolvedPath = `../agent/${suffix}/index.js`;
				} else {
					// File path (e.g., @agent/hello/agent) - add .js
					const finalPath = suffix.endsWith('.js')
						? suffix
						: suffix.replace(/\.tsx?$/, '') + '.js';
					resolvedPath = `../agent/${finalPath}`;
				}
			} else if (resolvedPath.startsWith('@api/')) {
				// src/generated/ -> src/api/ is ../api/
				const suffix = resolvedPath.substring('@api/'.length);
				const finalPath = suffix.endsWith('.js')
					? suffix
					: suffix.replace(/\.tsx?$/, '') + '.js';
				resolvedPath = `../api/${finalPath}`;
			} else if (resolvedPath.startsWith('./') || resolvedPath.startsWith('../')) {
				// Resolve relative import from route file's directory
				const routeDir = route.filename.substring(0, route.filename.lastIndexOf('/'));
				// Join and normalize the path
				const joined = `${routeDir}/${resolvedPath}`;
				// Normalize by resolving .. and . segments
				const normalized = joined
					.split('/')
					.reduce((acc: string[], segment) => {
						if (segment === '..') {
							acc.pop();
						} else if (segment !== '.' && segment !== '') {
							acc.push(segment);
						}
						return acc;
					}, [])
					.join('/');
				// Remove 'src/' prefix if present (routes are in src/, generated is in src/generated/)
				const withoutSrc = normalized.startsWith('src/') ? normalized.substring(4) : normalized;
				// Make it relative from src/generated/
				resolvedPath = `../${withoutSrc}`;
				// Add .js extension if not already present
				if (!resolvedPath.endsWith('.js')) {
					resolvedPath = resolvedPath.replace(/\.tsx?$/, '') + '.js';
				}
			}

			const uniqueImportName = route.agentVariable;
			imports.push(`import type ${uniqueImportName} from '${resolvedPath}';`);
			agentImports.set(route.agentVariable, uniqueImportName);
		}

		// Collect schema variable imports
		if (route.inputSchemaVariable || route.outputSchemaVariable) {
			const filename = route.filename.replace(/\\/g, '/');
			// Remove 'src/' prefix if present (routes.filename might be './api/...' or 'src/api/...')
			const withoutSrc = filename.startsWith('src/') ? filename.substring(4) : filename;
			const withoutLeadingDot = withoutSrc.startsWith('./')
				? withoutSrc.substring(2)
				: withoutSrc;
			const importPath = `../${withoutLeadingDot.replace(/\.ts$/, '')}`;

			if (!routeFileImports.has(importPath)) {
				routeFileImports.set(importPath, new Set());
			}

			if (route.inputSchemaVariable) {
				routeFileImports.get(importPath)!.add(route.inputSchemaVariable);
			}
			if (route.outputSchemaVariable) {
				routeFileImports.get(importPath)!.add(route.outputSchemaVariable);
			}
		}
	});

	// Generate schema imports with unique aliases to avoid conflicts
	const schemaImportAliases = new Map<string, Map<string, string>>(); // importPath -> (schemaName -> alias)
	let aliasCounter = 0;

	routeFileImports.forEach((schemas, importPath) => {
		const aliases = new Map<string, string>();
		const importParts: string[] = [];

		for (const schemaName of Array.from(schemas)) {
			// Create a unique alias for this schema to avoid collisions
			const alias = `${schemaName}_${aliasCounter++}`;
			aliases.set(schemaName, alias);
			importParts.push(`${schemaName} as ${alias}`);
		}

		schemaImportAliases.set(importPath, aliases);
		imports.push(`import type { ${importParts.join(', ')} } from '${importPath}';`);
	});

	const importsStr = imports.length > 0 ? imports.join('\n') + '\n' : '';

	// Add InferInput/InferOutput imports if we have any routes with schemas
	const hasSchemas = allRoutes.some(
		(r) => r.hasValidator || r.inputSchemaVariable || r.outputSchemaVariable || r.agentVariable
	);
	const typeImports = hasSchemas
		? `import type { InferInput, InferOutput } from '@agentuity/core';\n`
		: '';

	// Generate individual route schema types
	const routeSchemaTypes = allRoutes
		.filter(
			(r) => r.hasValidator || r.inputSchemaVariable || r.outputSchemaVariable || r.agentVariable
		)
		.map((route) => {
			const routeKey = route.method ? `${route.method.toUpperCase()} ${route.path}` : route.path;
			const safeName = routeKey
				.replace(/[^a-zA-Z0-9]/g, '_')
				.replace(/^_+|_+$/g, '')
				.replace(/_+/g, '_');
			const pascalName = toPascalCase(safeName);

			let inputType = 'never';
			let outputType = 'never';
			let inputSchemaType = 'never';
			let outputSchemaType = 'never';
			let agentMeta: AgentMetadata | undefined;

			// Look up agent metadata if available
			if (route.agentVariable) {
				agentMeta = agentMetadataMap.get(route.agentVariable);
			}

			// Only generate agent-based types if the import was successfully added
			// (import is only added when hasValidator && agentVariable && agentImportPath are all present)
			const importName = route.agentVariable ? agentImports.get(route.agentVariable) : undefined;
			if (importName) {
				inputType = `InferInput<typeof ${importName}['inputSchema']>`;
				outputType = `InferOutput<typeof ${importName}['outputSchema']>`;
				inputSchemaType = `typeof ${importName} extends { inputSchema?: infer I } ? I : never`;
				outputSchemaType = `typeof ${importName} extends { outputSchema?: infer O } ? O : never`;
			} else if (route.inputSchemaVariable || route.outputSchemaVariable) {
				// Get the aliased schema names for this route's file
				const filename = route.filename.replace(/\\/g, '/');
				const withoutSrc = filename.startsWith('src/') ? filename.substring(4) : filename;
				const withoutLeadingDot = withoutSrc.startsWith('./')
					? withoutSrc.substring(2)
					: withoutSrc;
				const importPath = `../${withoutLeadingDot.replace(/\.ts$/, '')}`;
				const aliases = schemaImportAliases.get(importPath);

				const inputAlias = route.inputSchemaVariable && aliases?.get(route.inputSchemaVariable);
				const outputAlias =
					route.outputSchemaVariable && aliases?.get(route.outputSchemaVariable);

				inputType = inputAlias ? `InferInput<typeof ${inputAlias}>` : 'never';
				outputType = outputAlias ? `InferOutput<typeof ${outputAlias}>` : 'never';
				inputSchemaType = inputAlias ? `typeof ${inputAlias}` : 'never';
				outputSchemaType = outputAlias ? `typeof ${outputAlias}` : 'never';
			}

			if (inputType === 'never' && outputType === 'never') {
				return ''; // Skip routes without schemas
			}

			// Build JSDoc with agent description and schema details
			const inputJSDoc = ['/**', ` * Input type for route: ${routeKey}`];
			if (agentMeta?.description) {
				inputJSDoc.push(` * @description ${agentMeta.description}`);
			}
			if (agentMeta?.inputSchemaCode) {
				inputJSDoc.push(` * @schema ${agentMeta.inputSchemaCode}`);
			}
			inputJSDoc.push(' */');

			const outputJSDoc = ['/**', ` * Output type for route: ${routeKey}`];
			if (agentMeta?.description) {
				outputJSDoc.push(` * @description ${agentMeta.description}`);
			}
			if (agentMeta?.outputSchemaCode) {
				outputJSDoc.push(` * @schema ${agentMeta.outputSchemaCode}`);
			}
			outputJSDoc.push(' */');

			const parts = [
				'',
				...inputJSDoc,
				`export type ${pascalName}Input = ${inputType};`,
				'',
				...outputJSDoc,
				`export type ${pascalName}Output = ${outputType};`,
				'',
				`/**`,
				` * Input schema type for route: ${routeKey}`,
				` */`,
				`export type ${pascalName}InputSchema = ${inputSchemaType};`,
				'',
				`/**`,
				` * Output schema type for route: ${routeKey}`,
				` */`,
				`export type ${pascalName}OutputSchema = ${outputSchemaType};`,
			];
			return parts.join('\n');
		})
		.filter(Boolean)
		.join('\n');

	// Helper to generate route entry - uses exported schema types
	const generateRouteEntry = (route: RouteInfo, pathIncludesMethod = false): string => {
		const routeKey = route.path;
		// For WebSocket/SSE routes, we need to include the method in the type name
		// to match the generated types (which use "POST /api/websocket/echo" as the routeKey)
		// For API routes, the method is already in the path from the caller
		const typeRouteKey = pathIncludesMethod
			? route.path
			: `${route.method?.toUpperCase()} ${route.path}`;
		const safeName = typeRouteKey
			.replace(/[^a-zA-Z0-9]/g, '_')
			.replace(/^_+|_+$/g, '')
			.replace(/_+/g, '_');
		const pascalName = toPascalCase(safeName);

		// Use the exported schema types we generated above
		// Note: agentImports.get() may return undefined if import wasn't added
		const importName = route.agentVariable ? agentImports.get(route.agentVariable) : null;

		// Use 'never' types if no schemas were actually extracted
		// Note: hasValidator may be true (e.g., zValidator('query', ...)) but no schemas extracted
		// because only 'json' validators extract input schemas
		// Also check if agentVariable exists but import wasn't added (missing agentImportPath)
		const hasValidAgentImport = route.agentVariable ? !!importName : false;

		// Generate pathParams type
		const pathParamsType = generatePathParamsType(route.pathParams);

		if (!route.inputSchemaVariable && !route.outputSchemaVariable && !hasValidAgentImport) {
			const streamValue = route.stream === true ? 'true' : 'false';
			return `\t'${routeKey}': {
		\t\tinputSchema: never;
		\t\toutputSchema: never;
		\t\tstream: ${streamValue};
		\t\tparams: ${pathParamsType};
		\t};`;
		}
		const streamValue = importName
			? `typeof ${importName} extends { stream?: infer S } ? S : false`
			: route.stream === true
				? 'true'
				: 'false';

		return `\t'${routeKey}': {
		\t\tinputSchema: ${pascalName}InputSchema;
		\t\toutputSchema: ${pascalName}OutputSchema;
		\t\tstream: ${streamValue};
		\t\tparams: ${pathParamsType};
		\t};`;
	};

	// Generate route entries with METHOD prefix for API routes
	const apiRouteEntries = apiRoutes
		.map((route) => {
			const routeKey = `${route.method.toUpperCase()} ${route.path}`;
			return generateRouteEntry({ ...route, path: routeKey }, true);
		})
		.join('\n');

	const websocketRouteEntries = websocketRoutes
		.map((r) => generateRouteEntry(r, false))
		.join('\n');
	const sseRouteEntries = sseRoutes.map((r) => generateRouteEntry(r, false)).join('\n');

	// Generate RPC-style nested registry type
	const rpcRegistryType = generateRPCRegistryType(
		apiRoutes,
		websocketRoutes,
		sseRoutes,
		agentImports,
		schemaImportAliases,
		agentMetadataMap
	);
	const rpcRuntimeMetadata = generateRPCRuntimeMetadata(apiRoutes, websocketRoutes, sseRoutes);

	const generatedContent = `// @generated
// Auto-generated by Agentuity - DO NOT EDIT
${importsStr}${typeImports}${
		shouldEmitFrontendClient
			? `
import { createClient } from '@agentuity/frontend';`
			: ''
	}
// ============================================================================
// Route Schema Type Exports
// ============================================================================
${routeSchemaTypes}

// ============================================================================
// Route Definitions
// ============================================================================

/**
 * Route Definitions
 * 
 * Type-safe route registry for all API routes, WebSocket connections, and SSE endpoints.
 * Used by @agentuity/react and @agentuity/frontend for client-side type-safe routing.
 * 
 * @remarks
 * This module augmentation is auto-generated from your route files during build.
 * Individual route Input/Output types are exported above for direct usage.
 * 
 * The augmentation targets @agentuity/frontend (the canonical source of registry types).
 * Since @agentuity/react re-exports these types, the augmentation is visible when
 * importing from either package.
 */
${
	shouldEmitFrontendClient
		? `
/**
 * RPC Route Registry
 * 
 * Nested structure for RPC-style client access (e.g., client.hello.post())
 * Used by createClient() from @agentuity/frontend for type-safe RPC calls.
 */
export interface RPCRouteRegistry {
${rpcRegistryType}
}
`
		: ''
}
declare module '@agentuity/frontend' {
\t/**
\t * API Route Registry
\t * 
\t * Maps route keys (METHOD /path) to their input/output schemas
\t */
\texport interface RouteRegistry {
${apiRouteEntries}
\t}
\t
\t/**
\t * WebSocket Route Registry
\t * 
\t * Maps WebSocket route paths to their schemas
\t */
\texport interface WebSocketRouteRegistry {
${websocketRouteEntries}
\t}
\t
\t/**
\t * Server-Sent Events Route Registry
\t * 
\t * Maps SSE route paths to their schemas
\t */
\texport interface SSERouteRegistry {
${sseRouteEntries}
\t}

\t/**
\t * RPC Route Registry
\t * 
\t * Nested structure for RPC-style client access (e.g., client.hello.post())
\t * Used by createClient() from @agentuity/frontend for type-safe RPC calls.
\t */
\texport interface RPCRouteRegistry {
${rpcRegistryType}
\t}
}
${
	hasReactDependency
		? `
// Backward compatibility: also augment @agentuity/react for older versions
// that define RouteRegistry locally instead of re-exporting from @agentuity/frontend
declare module '@agentuity/react' {
\texport interface RouteRegistry {
${apiRouteEntries}
\t}
\texport interface WebSocketRouteRegistry {
${websocketRouteEntries}
\t}
\texport interface SSERouteRegistry {
${sseRouteEntries}
\t}
\texport interface RPCRouteRegistry {
${rpcRegistryType}
\t}
}
`
		: ''
}
/**
 * Runtime metadata for RPC routes.
 * Contains route type information for client routing decisions.
 * @internal
 */
const _rpcRouteMetadata = ${rpcRuntimeMetadata} as const;

// Store metadata globally for createAPIClient() to access
if (typeof globalThis !== 'undefined') {
	(globalThis as Record<string, unknown>).__rpcRouteMetadata = _rpcRouteMetadata;
}
${
	shouldEmitFrontendClient
		? `
/**
 * Create a type-safe API client with optional configuration.
 *
 * This function is only generated when @agentuity/frontend is installed
 * but @agentuity/react is not. For React apps, import createAPIClient
 * from '@agentuity/react' instead.
 *
 * @example
 * \`\`\`typescript
 * import { createAPIClient } from './generated/routes';
 *
 * // Basic usage
 * const api = createAPIClient();
 * const result = await api.hello.post({ name: 'World' });
 *
 * // With custom headers
 * const api = createAPIClient({ headers: { 'X-Custom-Header': 'value' } });
 * await api.hello.post({ name: 'World' });
 * \`\`\`
 */
export function createAPIClient(options?: Parameters<typeof createClient>[0]): import('@agentuity/frontend').Client<RPCRouteRegistry> {
	return createClient(options || {}, _rpcRouteMetadata) as import('@agentuity/frontend').Client<RPCRouteRegistry>;
}
`
		: hasReactDependency
			? `
/**
 * Type-safe API client is available from @agentuity/react
 *
 * @example
 * \`\`\`typescript
 * import { createAPIClient } from '@agentuity/react';
 *
 * const api = createAPIClient();
 * const result = await api.hello.post({ name: 'World' });
 * \`\`\`
 */
`
			: ''
}

// FOUND AN ERROR IN THIS FILE?
// Please file an issue at https://github.com/agentuity/sdk/issues
// or if you know the fix please submit a PR!
`;

	const generatedDir = join(srcDir, 'generated');
	const registryPath = join(generatedDir, 'routes.ts');

	mkdirSync(generatedDir, { recursive: true });

	// Collapse 2+ consecutive empty lines into 1 empty line (3+ \n becomes 2 \n)
	const cleanedContent = generatedContent.replace(/\n{3,}/g, '\n\n');

	writeFileSync(registryPath, cleanedContent, 'utf-8');
}
