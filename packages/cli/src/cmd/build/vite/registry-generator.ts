/**
 * Registry Generator
 *
 * Generates src/generated/registry.ts from discovered agents
 */

import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { StructuredError } from '@agentuity/core';
import { toCamelCase, toPascalCase } from '../../../utils/string';
import { toForwardSlash } from '../../../utils/normalize-path';
import type { AgentMetadata } from './agent-discovery';

const AgentIdentifierCollisionError = StructuredError('AgentIdentifierCollisionError');

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
				let evalRelativePath = toForwardSlash(evalMeta.filename);
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
			let relativePath = toForwardSlash(filename);
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
