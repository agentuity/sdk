import type { BunPlugin } from 'bun';
import { dirname, basename, join, resolve } from 'node:path';
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import type { BuildMetadata } from '@agentuity/server';
import {
	parseAgentMetadata,
	parseRoute,
	parseEvalMetadata,
	analyzeWorkbench,
	checkRouteConflicts,
	generateLifecycleTypes,
	findCreateAppEndPosition,
} from './ast';
import { StructuredError, type WorkbenchConfig } from '@agentuity/core';
import { applyPatch, generatePatches } from './patch';
import { detectSubagent } from '../../utils/detectSubagent';
import { createLogger } from '@agentuity/server';
import type { LogLevel } from '../../types';
import { toCamelCase, toPascalCase } from '../../utils/string';

/**
 * Setup lifecycle types by analyzing app.ts for setup() function
 */
async function setupLifecycleTypes(
	rootDir: string,
	outDir: string,
	srcDir: string,
	logger: ReturnType<typeof createLogger>
): Promise<boolean> {
	// Look for app.ts in both root and src directories
	const rootAppFile = join(dirname(srcDir), 'app.ts');
	const srcAppFile = join(srcDir, 'app.ts');

	let appFile = '';
	if (await Bun.file(rootAppFile).exists()) {
		appFile = rootAppFile;
	} else if (await Bun.file(srcAppFile).exists()) {
		appFile = srcAppFile;
	}

	if (!appFile || !(await Bun.file(appFile).exists())) {
		return false;
	}

	try {
		return await generateLifecycleTypes(rootDir, outDir, appFile);
	} catch (error) {
		logger.fatal('Failed to generate lifecycle types:', error);
	}
}

/**
 * Setup workbench configuration by analyzing app.ts file
 */
async function setupWorkbench(srcDir: string): Promise<WorkbenchConfig | null> {
	// Look for app.ts in both root and src directories
	const rootAppFile = join(dirname(srcDir), 'app.ts');
	const srcAppFile = join(srcDir, 'app.ts');

	let appFile = '';
	if (await Bun.file(rootAppFile).exists()) {
		appFile = rootAppFile;
	} else if (await Bun.file(srcAppFile).exists()) {
		appFile = srcAppFile;
	}

	if (!appFile || !(await Bun.file(appFile).exists())) {
		return null;
	}

	const appContent = await Bun.file(appFile).text();
	const analysis = analyzeWorkbench(appContent);

	if (!analysis.hasWorkbench) {
		return null;
	}

	const workbenchConfig = analysis.config;

	// Check for route conflicts if workbench is being used
	if (workbenchConfig?.route) {
		const hasConflict = checkRouteConflicts(appContent, workbenchConfig.route);
		if (hasConflict) {
			const logger = createLogger((process.env.AGENTUITY_LOG_LEVEL as LogLevel) || 'info');
			logger.error(`🚨 Route conflict detected!\n`);
			logger.error(
				`   Workbench route '${workbenchConfig.route}' conflicts with existing application route`
			);
			logger.error(`   Please use a different route or remove the conflicting route.\n`);
		}
	}

	return workbenchConfig;
}

const AgentIdentifierCollisionError = StructuredError('AgentIdentifierCollisionError');
const SubAgentNameCollisionError = StructuredError('SubAgentNameCollisionError');

function generateAgentRegistry(srcDir: string, agentInfo: Array<Record<string, string>>) {
	// Separate parent agents and subagents
	const parentAgents = agentInfo.filter((a) => !a.parent);
	const subagents = agentInfo.filter((a) => a.parent);

	// Group subagents by parent
	const subagentsByParent = new Map<string, Array<Record<string, string>>>();
	for (const subagent of subagents) {
		const parentName = subagent.parent!;
		if (!subagentsByParent.has(parentName)) {
			subagentsByParent.set(parentName, []);
		}
		subagentsByParent.get(parentName)!.push(subagent);
	}

	// Detect naming collisions in generated identifiers
	// Naming strategy: parent + child names are combined as `${parent}_${name}` then converted to camelCase
	// Example: parent="user", child="profile" → "user_profile" → "userProfile"
	// Potential collision: parent="user_profile", child="info" and parent="user", child="profile_info" both → "userProfileInfo"
	const generatedNames = new Set<string>();
	const collisions: string[] = [];

	for (const agent of agentInfo) {
		const fullName = agent.parent ? `${agent.parent}_${agent.name}` : agent.name;
		const camelName = toCamelCase(fullName);

		if (generatedNames.has(camelName)) {
			collisions.push(`Identifier collision detected: "${camelName}" (from "${fullName}")`);
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

	// Generate imports for all agents
	const imports = agentInfo
		.map(({ name, path, parent }) => {
			const fullName = parent ? `${parent}.${name}` : name;
			const camelName = toCamelCase(fullName.replace('.', '_'));
			const relativePath = path.replace(/^\.\/agent\//, './');
			return `import ${camelName}Agent from '${relativePath}';`;
		})
		.join('\n');

	// Evals are now imported in plugin.ts when agents are registered
	// No need to import them in registry.generated.ts
	const evalsImportsStr = '';

	// Validate that child property names don't collide with parent agent properties
	const reservedAgentProperties = ['metadata', 'run', 'inputSchema', 'outputSchema', 'stream'];
	for (const parentAgent of parentAgents) {
		const children = subagentsByParent.get(parentAgent.name) || [];
		for (const child of children) {
			const childPropertyName = toCamelCase(child.name);

			// Check for collision with reserved agent properties
			if (reservedAgentProperties.includes(childPropertyName)) {
				throw new SubAgentNameCollisionError({
					message:
						`Subagent property name collision detected: "${childPropertyName}" in parent "${parentAgent.name}"\n` +
						`The child name "${child.name}" conflicts with a reserved agent property (${reservedAgentProperties.join(', ')}).\n` +
						`Please rename the subagent to avoid this collision.`,
				});
			}
		}
	}

	// Generate nested registry structure
	const registryLines: string[] = [];
	for (const parentAgent of parentAgents) {
		const parentCamelName = toCamelCase(parentAgent.name);
		const children = subagentsByParent.get(parentAgent.name) || [];

		if (children.length === 0) {
			// No subagents, simple assignment
			registryLines.push(`  ${parentCamelName}: ${parentCamelName}Agent,`);
		} else {
			// Has subagents, create nested structure using object spread (no mutation)
			registryLines.push(`  ${parentCamelName}: {`);
			registryLines.push(`    ...${parentCamelName}Agent,`);
			for (const child of children) {
				const childCamelName = toCamelCase(`${parentAgent.name}_${child.name}`);
				registryLines.push(`    ${toCamelCase(child.name)}: ${childCamelName}Agent,`);
			}
			registryLines.push(`  },`);
		}
	}
	const registry = registryLines.join('\n');

	// Generate type exports for all agents
	const typeExports = agentInfo
		.map(({ name, parent }) => {
			const fullName = parent ? `${parent}_${name}` : name;
			const camelName = toCamelCase(fullName);
			const pascalName = toPascalCase(fullName);
			return `export type ${pascalName}AgentRunner = AgentRunner<typeof ${camelName}Agent['inputSchema'], typeof ${camelName}Agent['outputSchema'], typeof ${camelName}Agent['stream'] extends true ? true : false>;`;
		})
		.join('\n');

	// Generate nested agent type definitions for Hono Context augmentation
	const honoAgentTypeLines: string[] = [];
	for (const parentAgent of parentAgents) {
		const parentCamelName = toCamelCase(parentAgent.name);
		const children = subagentsByParent.get(parentAgent.name) || [];

		if (children.length === 0) {
			// No subagents
			honoAgentTypeLines.push(
				`	   ${parentCamelName}: AgentRunner<LocalAgentRegistry['${parentCamelName}']['inputSchema'], LocalAgentRegistry['${parentCamelName}']['outputSchema'], LocalAgentRegistry['${parentCamelName}']['stream'] extends true ? true : false>;`
			);
		} else {
			// Has subagents - create intersection type
			honoAgentTypeLines.push(
				`	   ${parentCamelName}: AgentRunner<LocalAgentRegistry['${parentCamelName}']['inputSchema'], LocalAgentRegistry['${parentCamelName}']['outputSchema'], LocalAgentRegistry['${parentCamelName}']['stream'] extends true ? true : false> & {`
			);
			for (const child of children) {
				const childCamelName = toCamelCase(child.name);
				const fullChildName = toCamelCase(`${parentAgent.name}_${child.name}`);
				honoAgentTypeLines.push(
					`	     ${childCamelName}: AgentRunner<typeof ${fullChildName}Agent['inputSchema'], typeof ${fullChildName}Agent['outputSchema'], typeof ${fullChildName}Agent['stream'] extends true ? true : false>;`
				);
			}
			honoAgentTypeLines.push(`	   };`);
		}
	}
	const honoAgentTypes = honoAgentTypeLines.join('\n');

	// Generate agent type definitions for AgentRegistry interface augmentation
	const runtimeAgentTypeLines: string[] = [];
	for (const parentAgent of parentAgents) {
		const parentCamelName = toCamelCase(parentAgent.name);
		const children = subagentsByParent.get(parentAgent.name) || [];

		if (children.length === 0) {
			// No subagents - use typeof the imported agent
			runtimeAgentTypeLines.push(
				`		${parentCamelName}: AgentRunner<typeof ${parentCamelName}Agent['inputSchema'], typeof ${parentCamelName}Agent['outputSchema'], typeof ${parentCamelName}Agent['stream'] extends true ? true : false>;`
			);
		} else {
			// Has subagents - create intersection type using typeof
			runtimeAgentTypeLines.push(
				`		${parentCamelName}: AgentRunner<typeof ${parentCamelName}Agent['inputSchema'], typeof ${parentCamelName}Agent['outputSchema'], typeof ${parentCamelName}Agent['stream'] extends true ? true : false> & {`
			);
			for (const child of children) {
				const childCamelName = toCamelCase(child.name);
				const fullChildName = toCamelCase(`${parentAgent.name}_${child.name}`);
				runtimeAgentTypeLines.push(
					`			${childCamelName}: AgentRunner<typeof ${fullChildName}Agent['inputSchema'], typeof ${fullChildName}Agent['outputSchema'], typeof ${fullChildName}Agent['stream'] extends true ? true : false>;`
				);
			}
			runtimeAgentTypeLines.push(`		};`);
		}
	}
	const runtimeAgentTypes = runtimeAgentTypeLines.join('\n');

	// Generate React client types with nested structure
	const clientAgentTypeLines: string[] = [];
	for (const parentAgent of parentAgents) {
		const parentCamelName = toCamelCase(parentAgent.name);
		const children = subagentsByParent.get(parentAgent.name) || [];

		if (children.length === 0) {
			// No subagents
			clientAgentTypeLines.push(
				`		'${parentAgent.name}': Agent<typeof ${parentCamelName}Agent['inputSchema'], typeof ${parentCamelName}Agent['outputSchema']>;`
			);
		} else {
			// Has subagents - create nested type with subagent access via dot notation
			clientAgentTypeLines.push(
				`		'${parentAgent.name}': Agent<typeof ${parentCamelName}Agent['inputSchema'], typeof ${parentCamelName}Agent['outputSchema']>;`
			);
			for (const child of children) {
				const fullChildName = toCamelCase(`${parentAgent.name}_${child.name}`);
				clientAgentTypeLines.push(
					`		'${parentAgent.name}.${child.name}': Agent<typeof ${fullChildName}Agent['inputSchema'], typeof ${fullChildName}Agent['outputSchema']>;`
				);
			}
		}
	}
	const reactAgentTypes = clientAgentTypeLines.join('\n');

	const generatedContent = `/// <reference types="hono" />
// Auto-generated by Agentuity - do not edit manually
${imports}${evalsImportsStr}
import type { AgentRunner, Logger } from '@agentuity/runtime';
import type { KeyValueStorage, ObjectStorage, StreamStorage, VectorStorage } from '@agentuity/core';
import type { Agent } from '@agentuity/react';

/**
 * Registry of all agents in this application.
 * Provides strongly-typed access to agent metadata and runner functions.
 * Auto-generated from your agent files during build.
 */
export const agentRegistry = {
${registry}
} as const;

// Local type aliases for Hono augmentation
type LocalAgentName = keyof typeof agentRegistry;
type LocalAgentRegistry = typeof agentRegistry;

// Typed runners for each agent
${typeExports}

// Augment @agentuity/runtime types with strongly-typed agents from this project
declare module "@agentuity/runtime" {
	// Augment the AgentRegistry interface with project-specific strongly-typed agents
	export interface AgentRegistry {
${runtimeAgentTypes}
	}
}

// Augment Hono Context to provide strongly-typed agents and runtime services
// Note: Properties are added to Context via middleware in @agentuity/runtime
declare module "hono" {
	interface Context {
		agentName: LocalAgentName;
		agent: {
${honoAgentTypes}
		};
		waitUntil: (promise: Promise<void> | (() => void | Promise<void>)) => void;
		logger: Logger;
		kv: KeyValueStorage;
		objectstore: ObjectStorage;
		stream: StreamStorage;
		vector: VectorStorage;
	}
}

// Augment @agentuity/react types with strongly-typed agents from this project
declare module '@agentuity/react' {
	interface AgentRegistry {
${reactAgentTypes}
	}
}
`;

	const agentsDir = join(srcDir, 'agent');
	const registryPath = join(agentsDir, 'registry.generated.ts');
	const legacyTypesPath = join(agentsDir, 'types.generated.d.ts');

	// Ensure agent directory exists
	if (!existsSync(agentsDir)) {
		mkdirSync(agentsDir, { recursive: true });
	}

	writeFileSync(registryPath, generatedContent, 'utf-8');

	// Remove legacy types.generated.d.ts if it exists (now consolidated into registry.generated.ts)
	if (existsSync(legacyTypesPath)) {
		unlinkSync(legacyTypesPath);
	}
}

let metadata: Partial<BuildMetadata>;

export function getBuildMetadata(): Partial<BuildMetadata> {
	return metadata;
}

const AgentNameDuplicateError = StructuredError('AgentNameDuplicateError');
const MetadataMissingError = StructuredError('MetadataMissingError');
const MetadataPropertyMissingError = StructuredError('MetadataPropertyMissingError')<{
	name: string;
}>();
const SubAgentMissingError = StructuredError('SubAgentMissingError');

const AgentuityBundler: BunPlugin = {
	name: 'Agentuity Bundler',
	setup(build) {
		const rootDir = resolve(build.config.root ?? '.');
		const srcDir = join(rootDir, 'src');
		const outDir = build.config.outdir;
		if (!outDir) {
			throw new Error('missing outdir must be set');
		}
		const projectId = build.config.define?.['process.env.AGENTUITY_CLOUD_PROJECT_ID']
			? JSON.parse(build.config.define['process.env.AGENTUITY_CLOUD_PROJECT_ID'])
			: '';
		const deploymentId = build.config.define?.['process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID']
			? JSON.parse(build.config.define['process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID'])
			: '';
		const isDevMode =
			(build.config.define?.['process.env.NODE_ENV']
				? JSON.parse(build.config.define['process.env.NODE_ENV'])
				: 'production') === 'development';
		const routes: Set<string> = new Set();
		const agentInfo: Array<Record<string, string>> = [];
		const agentMetadata: Map<string, Map<string, string>> = new Map<
			string,
			Map<string, string>
		>();
		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		let routeDefinitions: BuildMetadata['routes'] = [];

		build.onResolve({ filter: /\/route\.ts$/, namespace: 'file' }, async (args) => {
			if (args.path.startsWith(srcDir)) {
				const importPath = args.path
					.replace(rootDir, '')
					.replace('.ts', '')
					.replace('/src/', './');
				routes.add(importPath);
			}
			return args;
		});

		build.onLoad({ filter: /\/route\.ts$/, namespace: 'file' }, async (args) => {
			if (args.path.startsWith(srcDir)) {
				const importPath = args.path
					.replace(rootDir, '')
					.replace('.ts', '')
					.replace('/src/', './');
				routes.add(importPath);
			}
			// return undefined to let Bun handle loading normally
			return;
		});

		build.onLoad({ filter: /\/agent\.ts$/, namespace: 'file' }, async (args) => {
			let newsource = await Bun.file(args.path).text();
			if (args.path.startsWith(srcDir)) {
				const contents = transpiler.transformSync(newsource);
				const [ns, md] = await parseAgentMetadata(
					rootDir,
					args.path,
					contents,
					projectId,
					deploymentId
				);
				newsource = ns;

				// Detect if this is a subagent by checking path structure
				// Note: Path structure assumption - 4 segments: agent/parent/child/agent.ts
				const { isSubagent, parentName } = detectSubagent(args.path, srcDir);
				if (isSubagent && parentName) {
					md.set('parent', parentName);
				}

				const newAgentName = md.get('name');
				for (const [, kv] of agentMetadata) {
					const found = kv.get('name');
					if (newAgentName === found) {
						throw new AgentNameDuplicateError({
							message: `The agent in ${kv.get('filename')} and the agent in ${md.get('filename')} have the same name (${found}). Agent Names must be unique within a project.`,
						});
					}
				}

				agentMetadata.set(md.get('identifier')!, md);
			}
			return {
				contents: newsource,
				loader: 'ts',
			};
		});

		build.onLoad({ filter: /\/eval\.ts$/, namespace: 'file' }, async (args) => {
			let newsource = await Bun.file(args.path).text();
			if (args.path.startsWith(srcDir)) {
				const contents = transpiler.transformSync(newsource);
				const [ns] = parseEvalMetadata(rootDir, args.path, contents, projectId, deploymentId);
				newsource = ns;
			}
			return {
				contents: newsource,
				loader: 'ts',
			};
		});

		const patches = generatePatches();
		for (const [, patch] of patches) {
			let modulePath = join('node_modules', patch.module, '.*');
			if (patch.filename) {
				modulePath = join('node_modules', patch.module, patch.filename + '.*');
			}
			build.onLoad(
				{
					filter: new RegExp(modulePath),
					namespace: 'file',
				},
				async (args) => {
					if (build.config.target !== 'bun') {
						return;
					}
					const [contents, loader] = await applyPatch(args.path, patch);
					return {
						contents,
						loader,
					};
				}
			);
		}

		build.onLoad(
			{
				filter: new RegExp(join(rootDir, 'app.ts')),
				namespace: 'file',
			},
			async (args) => {
				const logger = createLogger((process.env.AGENTUITY_LOG_LEVEL as LogLevel) || 'info');
				if (build.config.target !== 'bun') {
					return;
				}
				await args.defer();

				const inserts: string[] = [];
				const routeMapping: Record<string, string> = {};

				for (const route of routes) {
					const name = basename(dirname(route));
					const agent = route.replace(/\/route$/, '/agent');
					const hasAgent = existsSync(join(srcDir, agent + '.ts'));

					// Detect if this is a subagent route using shared utility
					const { isSubagent, parentName } = detectSubagent(route);

					const agentPath = route
						.replace(/\/route$/, '/*')
						.replace('./', '/');
					const routePath = route
						.replace(/\/route$/, '')
						.replace('/web/', '/api/')
						.replace('/web', '/api')
						.replace('./', '/');

					const definitions = await parseRoute(
						rootDir,
						join(srcDir, `${route}.ts`),
						projectId,
						deploymentId
					);

					let agentDetail: Record<string, string> = {};

					if (hasAgent) {
						const md = agentMetadata.get(name);
						if (!md) {
							throw new MetadataMissingError({
								message: `Couldn't find agent metadata for ${route}`,
							});
						}
						agentDetail = {
							name,
							id: md.get('id')!,
							path: `.${agent}`,
							filename: md.get('filename')!,
							identifier: md.get('identifier')!,
							description: md.get('description') ?? '',
							agentId: md.get('agentId')!,
						};
						if (isSubagent && parentName) {
							agentDetail.parent = parentName;
						}
						agentInfo.push(agentDetail);
						for (const def of definitions) {
							def.agentIds = [agentDetail.agentId, agentDetail.id];
						}
					}

					// do this after handling the agent association (if any)
					routeDefinitions = [...routeDefinitions, ...definitions];

					let buffer = `await (async() => {
    const { createAgentMiddleware, getRouter, registerAgent } = await import('@agentuity/runtime');
    const router = getRouter()!;
    const route = require('./src/${route}').default;`;
					if (hasAgent) {
						const agentRegistrationName =
							isSubagent && parentName ? `${parentName}.${name}` : name;
						// Build evals path from agent path (e.g., 'agent/eval/agent' -> 'agent/eval/eval.ts')
						const agentDirPath = agent.replace(/\/agent$/, '');
						const evalsPath = join(srcDir, agentDirPath, 'eval.ts');
						const evalsImport = existsSync(evalsPath)
							? `\n    require('./src/${agentDirPath}/eval');`
							: '';
						buffer += `
    const agent = require('./src/${agent}').default;
    router.all("${agentPath}", createAgentMiddleware('${agentRegistrationName}'));
    registerAgent("${agentRegistrationName}", agent);${evalsImport}`;
					}
					buffer += `
    router.route("${routePath}", route);
})();`;
					inserts.push(buffer);

					for (const def of definitions) {
						routeMapping[`${def.method} ${def.path}`] = def.id;
					}
				}

				// Register standalone agents (agents without routes)
				const routeAgentNames = new Set(
					agentInfo
						.filter((a) => {
							// Check if this agent was added via a route (has a corresponding route file)
							const agentPath = a.path.replace(/^\./, '').replace(/\/agent$/, '/route');
							return routes.has(agentPath.replace(/^\/src\//, './'));
						})
						.map((a) => a.name)
				);

				for (const agentDetail of agentInfo) {
					if (!routeAgentNames.has(agentDetail.name)) {
						// This is a standalone agent - register it without a route
						const agentPath = agentDetail.path;
						const agentDirPath = agentPath.replace(/\/agent$/, '');
						const evalsPath = join(srcDir, agentDirPath.replace(/^\./, ''), 'eval.ts');
						const evalsImport = existsSync(evalsPath)
							? `\n    require('./src/${agentDirPath.replace(/^\.\//, '')}/eval');`
							: '';
						const isSubagent = !!agentDetail.parent;
						const agentRegistrationName = isSubagent
							? `${agentDetail.parent}.${agentDetail.name}`
							: agentDetail.name;

						const buffer = `await (async() => {
    const { registerAgent } = await import('@agentuity/runtime');
    const agent = require('./src${agentPath}').default;
    registerAgent("${agentRegistrationName}", agent);${evalsImport}
})();`;
						inserts.push(buffer);
					}
				}

				const indexFile = join(srcDir, 'web', 'index.html');

				// Setup workbench configuration - evaluate fresh each time during builds
				const workbenchConfig = await setupWorkbench(srcDir);

				if (existsSync(indexFile)) {
					inserts.push(`import { serveStatic } from 'hono/bun';
import { getRouter, registerDevModeRoutes } from '@agentuity/runtime';
import { readFileSync, existsSync } from 'node:fs';

(() => {
    const router = getRouter()!;
	
	// Setup workbench routes if workbench was bundled
	const workbenchIndexPath = import.meta.dir + '/workbench/index.html';
	if (existsSync(workbenchIndexPath)) {
		let workbenchIndex = readFileSync(workbenchIndexPath, 'utf-8');
		
		// Always serve assets at /workbench/* regardless of HTML route
		const workbenchStatic = serveStatic({ root: import.meta.dir + '/workbench' });
		router.get('/workbench/*', workbenchStatic);
		
		// Use the workbench config determined at build time
		const route = ${JSON.stringify(workbenchConfig?.route || '/workbench')};

		// If using custom route, update HTML to point to absolute /workbench/ paths
		if (route !== '/workbench') {
			workbenchIndex = workbenchIndex.replace(new RegExp('src="\\\\.\\\\/workbench\\\\/', 'g'), 'src="/workbench/');
		}
		
		// Serve HTML at the configured route
		router.get(route, (c) => c.html(workbenchIndex));
	}
	
	let index = readFileSync(import.meta.dir + '/web/index.html', 'utf-8');
	if (${isDevMode}) {
		const end = index.lastIndexOf('</html>');
		const html = registerDevModeRoutes(router);
		if (end > 0) {
			index = index.substring(0,end) + html + index.substring(end);
		} else {
			index += html;
		}
	}
	const webstatic = serveStatic({ root: import.meta.dir + '/web' });
	router.get('/', (c) => c.html(index));
    router.get('/web/chunk/*', webstatic);
    router.get('/web/asset/*', webstatic);
	router.get('/public/*', webstatic);
})();`);
				}

				// Add standalone agents (agents without routes) to agentInfo
				// These agents can still be called by other agents or routes via ctx.agent
				const registeredIdentifiers = new Set(agentInfo.map((a) => a.identifier));
				for (const [identifier, md] of agentMetadata) {
					if (!registeredIdentifiers.has(identifier)) {
						// md.get('filename') can be either absolute or relative to rootDir
						const filename = md.get('filename')!;
						const absolutePath = filename.startsWith('/')
							? filename
							: join(rootDir, filename);

						// Convert to path relative to srcDir like route-based agents
						// e.g., /path/to/src/agent/lifecycle/agent.ts -> ./agent/lifecycle/agent
						const agentPath = absolutePath.replace(srcDir, '.').replace('.ts', '');

						// Extract folder name as agent name (same as route-based logic)
						const folderName = basename(dirname(absolutePath));

						const { isSubagent, parentName } = detectSubagent(absolutePath, srcDir);

						const agentDetail: Record<string, string> = {
							name: folderName,
							id: md.get('id')!,
							path: agentPath,
							filename: absolutePath,
							identifier: md.get('identifier')!,
							description: md.get('description') ?? '',
							agentId: md.get('agentId')!,
						};
						if (isSubagent && parentName) {
							agentDetail.parent = parentName;
						}
						agentInfo.push(agentDetail);
					}
				}

				// Only generate registry if there are agents
				// Note: We don't import the registry here because:
				// 1. Evals are already imported when agents are registered (see line 421-422)
				// 2. The registry is for type definitions only, not runtime execution
				// 3. Importing it causes bundler resolution issues since it's generated during build
				generateAgentRegistry(srcDir, agentInfo);

				// Generate lifecycle types if setup() is present in app.ts
				await setupLifecycleTypes(rootDir, outDir, srcDir, logger);

				// Only create the workbench routes if workbench is actually configured
				if (workbenchConfig) {
					inserts.push(`await (async() => {
	const { createWorkbenchRouter, getRouter } = await import('@agentuity/runtime');
	const router = getRouter()!;
	const workbenchRouter = createWorkbenchRouter();
	router.route('/', workbenchRouter);
})();`);
				}

				const file = Bun.file(args.path);
				let contents = await file.text();
				// Use AST-based parsing to reliably find createApp statement end
				const insertPos = findCreateAppEndPosition(contents);

				// Add initialization call after all agent registrations
				const setupCall = `
// Initialize providers and run agent setup callbacks after all agents are registered
await (async() => {
    const { runAgentSetups, getThreadProvider, getSessionProvider, getAppState } = await import('@agentuity/runtime');

	const threadProvider = getThreadProvider();
    const sessionProvider = getSessionProvider();

	const state = getAppState();

    // Initialize providers first
    await threadProvider.initialize(state);
	await sessionProvider.initialize(state);
    
    // Then run agent setups
    await runAgentSetups(state);
})();`;

				if (insertPos > 0) {
					contents =
						contents.slice(0, insertPos) +
						'\n\n' +
						inserts.join('\n') +
						setupCall +
						contents.slice(insertPos);
				} else {
					// Fallback: append to end if AST parsing fails
					logger.warn('Could not find createApp in AST, appending code to end of file');
					contents += `\n${inserts.join('\n')}${setupCall}`;
				}

				// generate the build metadata
				metadata = {
					routes: routeDefinitions,
					agents: [],
				};

				// Group agents by parent/child relationship
				const parentAgentMetadata = new Map<string, Map<string, string>>();
				const subagentsByParent = new Map<string, Array<Map<string, string>>>();

				for (const [, v] of agentMetadata) {
					if (!v.has('filename')) {
						throw new MetadataPropertyMissingError({
							name: 'filename',
							message: 'agent metadata is missing expected filename property',
						});
					}
					if (!v.has('id')) {
						throw new MetadataPropertyMissingError({
							name: 'id',
							message: 'agent metadata is missing expected id property',
						});
					}
					if (!v.has('identifier')) {
						throw new MetadataPropertyMissingError({
							name: 'identifier',
							message: 'agent metadata is missing expected identifier property',
						});
					}
					if (!v.has('version')) {
						throw new MetadataPropertyMissingError({
							name: 'version',
							message: 'agent metadata is missing expected version property',
						});
					}
					if (!v.has('name')) {
						throw new MetadataPropertyMissingError({
							name: 'name',
							message: 'agent metadata is missing expected name property',
						});
					}
					if (!v.has('agentId')) {
						throw new MetadataPropertyMissingError({
							name: 'agentId',
							message: 'agent metadata is missing expected agentId property',
						});
					}

					const parentName = v.get('parent');
					if (parentName) {
						// This is a subagent
						if (!subagentsByParent.has(parentName)) {
							subagentsByParent.set(parentName, []);
						}
						subagentsByParent.get(parentName)!.push(v);
					} else {
						// This is a parent or standalone agent
						parentAgentMetadata.set(v.get('identifier')!, v);
					}
				}

				// Validate that all subagents reference existing parent agents
				for (const [parentName, subagents] of subagentsByParent) {
					const parentExists = Array.from(parentAgentMetadata.values()).some(
						(meta) => meta.get('name') === parentName || meta.get('identifier') === parentName
					);
					if (!parentExists) {
						const subagentPaths = subagents.map((s) => s.get('filename')).join(', ');
						throw new SubAgentMissingError({
							message:
								`Subagent(s) [${subagentPaths}] reference parent "${parentName}" which does not exist. ` +
								`Ensure the parent agent is defined.`,
						});
					}
				}

				// Build metadata with nested subagents
				for (const [_identifier, v] of parentAgentMetadata) {
					const agentData: BuildMetadata['agents'][number] = {
						filename: v.get('filename')!,
						id: v.get('id')!,
						identifier: v.get('identifier')!,
						agentId: v.get('agentId')!,
						version: v.get('version')!,
						name: v.get('name')!,
						description: v.get('description') ?? '<no description provided>',
						projectId,
					};

					const evalsStr = v.get('evals');
					if (evalsStr) {
						logger.trace(
							`[plugin] Found evals string for agent ${agentData.name}, parsing...`
						);
						try {
							const parsedEvals = JSON.parse(evalsStr) as Array<
								Omit<
									NonNullable<BuildMetadata['agents'][number]['evals']>[number],
									'agentIdentifier' | 'projectId'
								>
							>;
							agentData.evals = parsedEvals.map((evalItem) => ({
								...evalItem,
								agentIdentifier: agentData.agentId,
								projectId,
							}));
							logger.trace(
								`[plugin] Successfully parsed ${agentData.evals?.length ?? 0} eval(s) for agent ${agentData.name}`
							);
						} catch (e) {
							logger.trace(
								`[plugin] Failed to parse evals for agent ${agentData.name}: ${e}`
							);
							console.warn(`Failed to parse evals for agent ${agentData.name}: ${e}`);
						}
					} else {
						logger.trace(`[plugin] No evals found for agent ${agentData.name}`);
					}

					// Add subagents if any (check both name and identifier)
					const subagents =
						subagentsByParent.get(agentData.name) ||
						subagentsByParent.get(agentData.identifier);
					if (subagents && subagents.length > 0) {
						agentData.subagents = subagents.map((sub) => {
							const subagentData: BuildMetadata['agents'][number] = {
								filename: sub.get('filename')!,
								id: sub.get('id')!,
								identifier: sub.get('identifier')!,
								agentId: sub.get('agentId')!,
								version: sub.get('version')!,
								name: sub.get('name')!,
								description: sub.get('description') ?? '<no description provided>',
								projectId,
							};

							// Add evals for subagents if any
							const subEvalsStr = sub.get('evals');
							if (subEvalsStr) {
								logger.trace(
									`[plugin] Found evals string for subagent ${subagentData.name}, parsing...`
								);
								try {
									const parsedSubEvals = JSON.parse(subEvalsStr) as Array<
										Omit<
											NonNullable<BuildMetadata['agents'][number]['evals']>[number],
											'agentIdentifier' | 'projectId'
										>
									>;
									subagentData.evals = parsedSubEvals.map((evalItem) => ({
										...evalItem,
										agentIdentifier: subagentData.agentId,
										projectId,
									}));
									logger.trace(
										`[plugin] Successfully parsed ${subagentData.evals?.length ?? 0} eval(s) for subagent ${subagentData.name}`
									);
								} catch (e) {
									logger.trace(
										`[plugin] Failed to parse evals for subagent ${subagentData.name}: ${e}`
									);
									console.warn(
										`Failed to parse evals for subagent ${subagentData.name}: ${e}`
									);
								}
							} else {
								logger.trace(`[plugin] No evals found for subagent ${subagentData.name}`);
							}

							return subagentData;
						});
					}

					metadata.agents!.push(agentData);
				}

				const routeMappingJSFile = Bun.file(join(outDir, '.routemapping.json'));
				await routeMappingJSFile.write(JSON.stringify(routeMapping));

				return {
					contents,
					loader: 'ts',
				};
			}
		);
	},
};

export default AgentuityBundler;
