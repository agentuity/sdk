import type { BunPlugin } from 'bun';
import { dirname, basename, join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import type { BuildMetadata } from '../../types';
import { parseAgentMetadata, parseRoute } from './ast';
import { applyPatch, generatePatches } from './patch';
import { detectSubagent } from '../../utils/detectSubagent';

function toCamelCase(str: string): string {
	return str
		.replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
		.replace(/^(.)/, (char) => char.toLowerCase());
}

function toPascalCase(str: string): string {
	const camel = toCamelCase(str);
	return camel.charAt(0).toUpperCase() + camel.slice(1);
}

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
		throw new Error(
			`Agent identifier naming collisions detected:\n${collisions.join('\n')}\n\n` +
				`This occurs when different agent names produce the same camelCase identifier.\n` +
				`Please rename your agents to avoid this collision.`
		);
	}

	// Generate imports for all agents
	const imports = agentInfo
		.map(({ name, path, parent }) => {
			const fullName = parent ? `${parent}.${name}` : name;
			const camelName = toCamelCase(fullName.replace('.', '_'));
			const relativePath = path.replace(/^\.\/agents\//, './');
			return `import ${camelName}Agent from '${relativePath}';`;
		})
		.join('\n');

	// Validate that child property names don't collide with parent agent properties
	const reservedAgentProperties = ['metadata', 'run', 'inputSchema', 'outputSchema', 'stream'];
	for (const parentAgent of parentAgents) {
		const children = subagentsByParent.get(parentAgent.name) || [];
		for (const child of children) {
			const childPropertyName = toCamelCase(child.name);

			// Check for collision with reserved agent properties
			if (reservedAgentProperties.includes(childPropertyName)) {
				throw new Error(
					`Subagent property name collision detected: "${childPropertyName}" in parent "${parentAgent.name}"\n` +
						`The child name "${child.name}" conflicts with a reserved agent property (${reservedAgentProperties.join(', ')}).\n` +
						`Please rename the subagent to avoid this collision.`
				);
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

	// Generate nested agent type definitions
	const agentTypeLines: string[] = [];
	for (const parentAgent of parentAgents) {
		const parentCamelName = toCamelCase(parentAgent.name);
		const children = subagentsByParent.get(parentAgent.name) || [];

		if (children.length === 0) {
			// No subagents
			agentTypeLines.push(
				`	   ${parentCamelName}: AgentRunner<AgentRegistry['${parentCamelName}']['inputSchema'], AgentRegistry['${parentCamelName}']['outputSchema'], AgentRegistry['${parentCamelName}']['stream'] extends true ? true : false>;`
			);
		} else {
			// Has subagents - create intersection type
			agentTypeLines.push(
				`	   ${parentCamelName}: AgentRunner<AgentRegistry['${parentCamelName}']['inputSchema'], AgentRegistry['${parentCamelName}']['outputSchema'], AgentRegistry['${parentCamelName}']['stream'] extends true ? true : false> & {`
			);
			for (const child of children) {
				const childCamelName = toCamelCase(child.name);
				const fullChildName = toCamelCase(`${parentAgent.name}_${child.name}`);
				agentTypeLines.push(
					`	     ${childCamelName}: AgentRunner<typeof ${fullChildName}Agent['inputSchema'], typeof ${fullChildName}Agent['outputSchema'], typeof ${fullChildName}Agent['stream'] extends true ? true : false>;`
				);
			}
			agentTypeLines.push(`	   };`);
		}
	}
	const agentTypes = agentTypeLines.join('\n');

	const generatedContent = `// Auto-generated by Agentuity - do not edit manually
${imports}
import type { AgentRunner, Logger } from '@agentuity/runtime';
import type { KeyValueStorage, ObjectStorage, StreamStorage, VectorStorage } from '@agentuity/core';

export const agentRegistry = {
${registry}
} as const;

export type AgentName = keyof typeof agentRegistry;
export type AgentRegistry = typeof agentRegistry;

// Typed runners for each agent
${typeExports}

// Augment Context to provide strongly-typed agents
declare module "hono" {
	interface Context {
	   agentName: AgentName;
	   agent: {
${agentTypes}
	   };
	   waitUntil: (promise: Promise<void> | (() => void | Promise<void>)) => void;
	   logger: Logger;
	   kv: KeyValueStorage;
	   objectstore: ObjectStorage;
	   stream: StreamStorage;
	   vector: VectorStorage;
  }
}
`;

	const agentsDir = join(srcDir, 'agents');
	const registryPath = join(agentsDir, 'registry.generated.ts');

	writeFileSync(registryPath, generatedContent, 'utf-8');

	// Generate React client types with nested structure
	const clientImports = agentInfo
		.map(({ name, path, parent }) => {
			const fullName = parent ? `${parent}_${name}` : name;
			const camelName = toCamelCase(fullName);
			const relativePath = path.replace(/^\.\/agents\//, './');
			return `import type ${camelName}Agent from '${relativePath}';`;
		})
		.join('\n');

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

	const clientTypesContent = `// Auto-generated by Agentuity - do not edit manually
// This file augments @agentuity/react with your project's agent types
${clientImports}
import type { Agent } from '@agentuity/react';

declare module '@agentuity/react' {
	interface AgentRegistry {
${clientAgentTypeLines.join('\n')}
	}
}
`;

	const clientTypesPath = join(agentsDir, 'types.generated.d.ts');
	writeFileSync(clientTypesPath, clientTypesContent, 'utf-8');
}

let metadata: Partial<BuildMetadata>;

export function getBuildMetadata(): Partial<BuildMetadata> {
	return metadata;
}

const AgentuityBundler: BunPlugin = {
	name: 'Agentuity Bundler',
	setup(build) {
		const isDev = build.config.minify !== true;
		const rootDir = build.config.root ?? '.';
		const srcDir = join(rootDir, 'src');
		const routes: Set<string> = new Set();
		const agentInfo: Array<Record<string, string>> = [];
		const agentMetadata: Map<string, Map<string, string>> = new Map<
			string,
			Map<string, string>
		>();
		const transpiler = new Bun.Transpiler({ loader: 'ts' });
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

		build.onLoad({ filter: /\/agent\.ts$/, namespace: 'file' }, async (args) => {
			let newsource = await Bun.file(args.path).text();
			if (args.path.startsWith(srcDir)) {
				const contents = transpiler.transformSync(newsource);
				const [ns, md] = parseAgentMetadata(rootDir, args.path, contents);
				newsource = ns;

				// Detect if this is a subagent by checking path structure
				// Note: Path structure assumption - 4 segments: agents/parent/child/agent.ts
				const { isSubagent, parentName } = detectSubagent(args.path, srcDir);
				if (isSubagent && parentName) {
					md.set('parent', parentName);
				}

				agentMetadata.set(md.get('identifier')!, md);
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
				if (build.config.target !== 'bun') {
					return;
				}
				await args.defer();

				const inserts: string[] = [];

				for (const route of routes) {
					const name = basename(dirname(route));
					const agent = route.replace(/\/route$/, '/agent');
					const hasAgent = existsSync(join(srcDir, agent + '.ts'));

					// Detect if this is a subagent route using shared utility
					const { isSubagent, parentName } = detectSubagent(route);

					const agentPath = route
						.replace(/\/route$/, '/*')
						.replace('/agents', '/agent')
						.replace('./', '/');
					const routePath = route
						.replace(/\/route$/, '')
						.replace('/apis/', '/api/')
						.replace('/apis', '/api')
						.replace('/agents', '/agent')
						.replace('/agents', '/agent')
						.replace('./', '/');

					if (!isDev) {
						const definitions = await parseRoute(rootDir, join(srcDir, route + '.ts'));
						routeDefinitions = [...routeDefinitions, ...definitions];
					}

					let agentDetail: Record<string, string> = {};

					if (hasAgent) {
						const md = agentMetadata.get(name);
						if (!md) {
							throw new Error(`Couldn't find agent metadata for ${route}`);
						}
						agentDetail = {
							name,
							path: `.${agent}`,
							filename: md.get('filename')!,
							identifier: md.get('identifier')!,
							description: md.get('description') ?? '',
						};
						if (isSubagent && parentName) {
							agentDetail.parent = parentName;
						}
						agentInfo.push(agentDetail);
					}

					let buffer = `await (async() => {
    const { createAgentMiddleware, getApp, registerAgent } = await import('@agentuity/runtime');
    const app = getApp()!;
    const route = require('./src/${route}').default;`;
					if (hasAgent) {
						const agentRegistrationName =
							isSubagent && parentName ? `${parentName}.${name}` : name;
						buffer += `
    const agent = require('./src/${agent}').default;
    app.all("${agentPath}", createAgentMiddleware('${agentRegistrationName}'));
    registerAgent("${agentRegistrationName}", agent);`;
					}
					buffer += `
    app.route("${routePath}", route);
})();`;
					inserts.push(buffer);
				}

				const indexFile = join(srcDir, 'web', 'index.html');

				if (existsSync(indexFile)) {
					inserts.unshift(`await (async () => {
    const { serveStatic } = require('hono/bun');
    const { getApp } = await import('@agentuity/runtime');
    const app = getApp()!;
	const index = await Bun.file(import.meta.dir + '/web/index.js').text();
	const webstatic = serveStatic({ root: import.meta.dir + '/web' });
	app.get('/', (c) => c.html(index));
    app.get('/chunk/*', webstatic);
    app.get('/asset/*', webstatic);
	app.get('/public/*', webstatic);
})();`);
				}

				generateAgentRegistry(srcDir, agentInfo);

				const file = Bun.file(args.path);
				let contents = await file.text();
				let inserted = false;
				const index = contents.indexOf(' createApp(');
				if (index > 0) {
					const endSemi = contents.indexOf(');', index);
					if (endSemi > 0) {
						contents =
							contents.slice(0, endSemi + 2) +
							'\n\n' +
							inserts.join('\n') +
							contents.slice(endSemi + 2);
						inserted = true;
					}
				}
				if (!inserted) {
					contents += `\n${inserts.join('\n')}`;
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
						throw new Error('agent metadata is missing expected filename property');
					}
					if (!v.has('id')) {
						throw new Error('agent metadata is missing expected id property');
					}
					if (!v.has('identifier')) {
						throw new Error('agent metadata is missing expected identifier property');
					}
					if (!v.has('version')) {
						throw new Error('agent metadata is missing expected version property');
					}
					if (!v.has('name')) {
						throw new Error('agent metadata is missing expected name property');
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
						throw new Error(
							`Subagent(s) [${subagentPaths}] reference parent "${parentName}" which does not exist. ` +
								`Ensure the parent agent is defined.`
						);
					}
				}

				// Build metadata with nested subagents
				for (const [_identifier, v] of parentAgentMetadata) {
					const agentData: BuildMetadata['agents'][number] = {
						filename: v.get('filename')!,
						id: v.get('id')!,
						identifier: v.get('identifier')!,
						version: v.get('version')!,
						name: v.get('name')!,
						description: v.get('description') ?? '<no description provided>',
					};

					// Add subagents if any (check both name and identifier)
					const subagents =
						subagentsByParent.get(agentData.name) ||
						subagentsByParent.get(agentData.identifier);
					if (subagents && subagents.length > 0) {
						agentData.subagents = subagents.map((sub) => ({
							filename: sub.get('filename')!,
							id: sub.get('id')!,
							identifier: sub.get('identifier')!,
							version: sub.get('version')!,
							name: sub.get('name')!,
							description: sub.get('description') ?? '<no description provided>',
						}));
					}

					metadata.agents!.push(agentData);
				}

				return {
					contents,
					loader: 'ts',
				};
			}
		);
	},
};

export default AgentuityBundler;
