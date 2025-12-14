import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Route information extracted from route files
 */
export interface RouteInfo {
	/** HTTP method (GET, POST, etc.) */
	method: string;
	/** Route path */
	path: string;
	/** Relative file path */
	filename: string;
	/** Variable name of the route handler */
	handlerVariable?: string;
	/** Whether this route uses validator */
	hasValidator: boolean;
	/** Route type: 'api' | 'websocket' | 'sse' | 'stream' */
	routeType?: string;
	/** Agent variable name if using agent.validator() */
	agentVariable?: string;
	/** Agent import path (e.g., '@agent/hello', '../shared/agents') */
	agentImportPath?: string;
	/** Input schema variable name if using validator({ input }) */
	inputSchemaVariable?: string;
	/** Output schema variable name if using validator({ output }) */
	outputSchemaVariable?: string;
	/** Whether this route is a streaming route (from validator({ stream: true })) */
	stream?: boolean;
}

/**
 * Generate RouteRegistry type definitions from discovered routes.
 *
 * Creates a module augmentation for @agentuity/react that provides
 * strongly-typed route keys with input/output schema information.
 *
 * @param srcDir - Source directory path
 * @param routes - Array of route information
 */
export function generateRouteRegistry(
	srcDir: string,
	routes: RouteInfo[],
	generatedDir?: string
): void {
	// Filter routes by type (include ALL routes, not just those with validators)
	// Note: 'stream' routes are HTTP routes that return ReadableStream, so include them with API routes
	const apiRoutes = routes.filter((r) => r.routeType === 'api' || r.routeType === 'stream');
	const websocketRoutes = routes.filter((r) => r.routeType === 'websocket');
	const sseRoutes = routes.filter((r) => r.routeType === 'sse');

	if (apiRoutes.length === 0 && websocketRoutes.length === 0 && sseRoutes.length === 0) {
		// No routes, skip generation
		return;
	}

	// Helper to generate imports for a specific output location
	const generateImports = (fromAgentuityDir: boolean) => {
		const imports: string[] = [];
		const agentImports = new Map<string, string>();

		const allRoutes = [...apiRoutes, ...websocketRoutes, ...sseRoutes];

		// First pass: collect all unique agents and schema variables (only for routes with validators)
		allRoutes.forEach((route) => {
			if (!route.hasValidator) {
				return;
			}
			if (
				route.agentVariable &&
				route.agentImportPath &&
				!agentImports.has(route.agentVariable)
			) {
				let resolvedPath = route.agentImportPath;

				if (fromAgentuityDir) {
					// From .agentuity/, paths go up one level then into src/
					if (resolvedPath.startsWith('@agent/')) {
						resolvedPath = `../src/agent/${resolvedPath.substring('@agent/'.length)}`;
					} else if (resolvedPath.startsWith('@api/')) {
						resolvedPath = `../src/web/${resolvedPath.substring('@api/'.length)}`;
					} else if (resolvedPath.startsWith('./') || resolvedPath.startsWith('../')) {
						const routeDir = route.filename.substring(0, route.filename.lastIndexOf('/'));
						resolvedPath = `../${routeDir}/${resolvedPath}`;
					}
				} else {
					// From src/_generated/, paths are relative within src/
					if (resolvedPath.startsWith('@agent/')) {
						resolvedPath = `../agent/${resolvedPath.substring('@agent/'.length)}`;
					} else if (resolvedPath.startsWith('@api/')) {
						resolvedPath = `../web/${resolvedPath.substring('@api/'.length)}`;
					} else if (resolvedPath.startsWith('./') || resolvedPath.startsWith('../')) {
						// Route filename is like src/api/foo.ts, we need to go from src/_generated/
						const routeDir = route.filename.substring(0, route.filename.lastIndexOf('/'));
						// Remove 'src/' prefix if present since we're already in src/_generated/
						const relativePath = routeDir.replace(/^src\//, '../');
						resolvedPath = `${relativePath}/${resolvedPath.replace(/^\.\//, '')}`;
					}
				}

				const uniqueImportName = `agent_${route.agentVariable}`;
				imports.push(`import type ${uniqueImportName} from '${resolvedPath}';`);
				agentImports.set(route.agentVariable, uniqueImportName);
			}
		});

		// Import schema variables from route files
		const routeFileImports = new Map<string, Set<string>>();
		allRoutes.forEach((route) => {
			if (!route.hasValidator) {
				return;
			}
			if (route.inputSchemaVariable || route.outputSchemaVariable) {
				const filename = route.filename.replace(/\\/g, '/');
				let importPath: string;

				if (fromAgentuityDir) {
					importPath = `../${filename.replace(/\.ts$/, '')}`;
				} else {
					// From src/_generated/, remove src/ prefix
					importPath = `../${filename.replace(/^src\//, '').replace(/\.ts$/, '')}`;
				}

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

		routeFileImports.forEach((schemas, importPath) => {
			const schemaList = Array.from(schemas).join(', ');
			imports.push(`import type { ${schemaList} } from '${importPath}';`);
		});

		return { imports, agentImports };
	};

	// Helper function to generate route entry
	const generateRouteEntry = (route: RouteInfo, agentImports: Map<string, string>): string => {
		const routeKey = route.path;

		if (!route.hasValidator) {
			const streamValue = route.stream === true ? 'true' : 'false';
			return `  '${routeKey}': {
    inputSchema: never;
    outputSchema: never;
    stream: ${streamValue};
  };`;
		}

		if (route.agentVariable) {
			const importName = agentImports.get(route.agentVariable)!;
			return `  '${routeKey}': {
    inputSchema: typeof ${importName} extends { inputSchema?: infer I } ? I : never;
    outputSchema: typeof ${importName} extends { outputSchema?: infer O } ? O : never;
    stream: typeof ${importName} extends { stream?: infer S } ? S : false;
  };`;
		}

		if (route.inputSchemaVariable || route.outputSchemaVariable) {
			const inputType = route.inputSchemaVariable
				? `typeof ${route.inputSchemaVariable}`
				: 'never';
			const outputType = route.outputSchemaVariable
				? `typeof ${route.outputSchemaVariable}`
				: 'never';
			const streamValue = route.stream === true ? 'true' : 'false';
			return `  '${routeKey}': {
    inputSchema: ${inputType};
    outputSchema: ${outputType};
    stream: ${streamValue};
  };`;
		}

		return `  '${routeKey}': {
    // Unable to extract schema types - validator might use inline schemas
    inputSchema: any;
    outputSchema: any;
  };`;
	};

	// Generate route entries helper
	const generateRouteEntries = (agentImports: Map<string, string>) => {
		const apiRouteEntries = apiRoutes
			.map((route) => {
				const routeKey = `${route.method.toUpperCase()} ${route.path}`;
				return generateRouteEntry({ ...route, path: routeKey }, agentImports);
			})
			.join('\n');

		const websocketRouteEntries = websocketRoutes
			.map((route) => generateRouteEntry(route, agentImports))
			.join('\n');

		const sseRouteEntries = sseRoutes
			.map((route) => generateRouteEntry(route, agentImports))
			.join('\n');

		return { apiRouteEntries, websocketRouteEntries, sseRouteEntries };
	};

	// Get the project root (parent of srcDir)
	const projectRoot = join(srcDir, '..');
	const agentuityDir = join(projectRoot, '.agentuity');
	const registryPath = join(agentuityDir, 'routes.generated.ts');

	// Ensure .agentuity directory exists
	if (!existsSync(agentuityDir)) {
		mkdirSync(agentuityDir, { recursive: true });
	}

	// Generate for .agentuity/ (with module augmentation)
	const { imports: agentuityImports, agentImports: agentuityAgentImports } = generateImports(true);
	const {
		apiRouteEntries: agentuityApiEntries,
		websocketRouteEntries: agentuityWsEntries,
		sseRouteEntries: agentuitySseEntries,
	} = generateRouteEntries(agentuityAgentImports);

	const generatedContent = `// Auto-generated by Agentuity - do not edit manually
${agentuityImports.join('\n')}

// Augment @agentuity/react types with project-specific routes
declare module '@agentuity/react' {
  export interface RouteRegistry {
${agentuityApiEntries}
  }
  
  export interface WebSocketRouteRegistry {
${agentuityWsEntries}
  }
  
  export interface SSERouteRegistry {
${agentuitySseEntries}
  }
}
`;

	writeFileSync(registryPath, generatedContent, 'utf-8');

	// Also generate to the user-configurable generatedDir (without module augmentation)
	if (generatedDir) {
		const resolvedGeneratedDir = resolve(projectRoot, generatedDir);

		// Ensure generatedDir exists
		if (!existsSync(resolvedGeneratedDir)) {
			mkdirSync(resolvedGeneratedDir, { recursive: true });
		}

		// Generate for src/_generated/ (without module augmentation, direct exports)
		const { imports: srcImports, agentImports: srcAgentImports } = generateImports(false);
		const {
			apiRouteEntries: srcApiEntries,
			websocketRouteEntries: srcWsEntries,
			sseRouteEntries: srcSseEntries,
		} = generateRouteEntries(srcAgentImports);

		const srcGeneratedContent = `// Auto-generated by Agentuity - do not edit manually
${srcImports.join('\n')}

export interface RouteRegistry {
${srcApiEntries}
}

export interface WebSocketRouteRegistry {
${srcWsEntries}
}

export interface SSERouteRegistry {
${srcSseEntries}
}
`;

		const srcRegistryPath = join(resolvedGeneratedDir, 'routes.generated.ts');
		writeFileSync(srcRegistryPath, srcGeneratedContent, 'utf-8');
	}
}
