import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
export function generateRouteRegistry(srcDir: string, routes: RouteInfo[]): void {
	// Filter routes by type (include ALL routes, not just those with validators)
	const apiRoutes = routes.filter((r) => r.routeType === 'api');
	const websocketRoutes = routes.filter((r) => r.routeType === 'websocket');
	const sseRoutes = routes.filter((r) => r.routeType === 'sse');

	if (apiRoutes.length === 0 && websocketRoutes.length === 0 && sseRoutes.length === 0) {
		// No routes, skip generation
		return;
	}

	// Generate imports for agents and schemas
	const imports: string[] = [];
	const agentImports = new Map<string, string>(); // Maps agent variable to unique import name
	const schemaImports = new Set<string>(); // Track which schema variables we've seen

	// Combine all routes for import collection
	const allRoutes = [...apiRoutes, ...websocketRoutes, ...sseRoutes];

	// First pass: collect all unique agents and schema variables (only for routes with validators)
	allRoutes.forEach((route) => {
		// Skip routes without validators - they won't need imports
		if (!route.hasValidator) {
			return;
		}
		// If this route uses an agent, import it directly
		if (route.agentVariable && route.agentImportPath && !agentImports.has(route.agentVariable)) {
			// Resolve the import path (could be @agent/hello, ../shared, etc.)
			let resolvedPath = route.agentImportPath;

			// If it's a path alias like @agent/hello, convert to relative path
			if (resolvedPath.startsWith('@agent/')) {
				resolvedPath = `../src/agent/${resolvedPath.substring('@agent/'.length)}`;
			} else if (resolvedPath.startsWith('@api/')) {
				resolvedPath = `../src/web/${resolvedPath.substring('@api/'.length)}`;
			} else if (resolvedPath.startsWith('./') || resolvedPath.startsWith('../')) {
				// Relative path - need to resolve relative to route file location
				const routeDir = route.filename.substring(0, route.filename.lastIndexOf('/'));
				resolvedPath = `../${routeDir}/${resolvedPath}`;
			}

			// Generate unique import name: agent_hello, agent_user, etc.
			const uniqueImportName = `agent_${route.agentVariable}`;
			imports.push(`import type ${uniqueImportName} from '${resolvedPath}';`);
			agentImports.set(route.agentVariable, uniqueImportName);
		}

		// Track schema variables for potential import from route file
		if (route.inputSchemaVariable) {
			schemaImports.add(route.inputSchemaVariable);
		}
		if (route.outputSchemaVariable) {
			schemaImports.add(route.outputSchemaVariable);
		}
	});

	// Import schema variables from route files
	const routeFileImports = new Map<string, Set<string>>(); // Maps route file to schema variables
	allRoutes.forEach((route) => {
		// Only import schemas for routes with validators
		if (!route.hasValidator) {
			return;
		}
		if (route.inputSchemaVariable || route.outputSchemaVariable) {
			const filename = route.filename.replace(/\\/g, '/');
			const importPath = `../${filename.replace(/\.ts$/, '')}`;

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

	// Generate imports for schema variables
	routeFileImports.forEach((schemas, importPath) => {
		const schemaList = Array.from(schemas).join(', ');
		imports.push(`import type { ${schemaList} } from '${importPath}';`);
	});

	const importsStr = imports.join('\n');

	// Helper function to generate route entry
	const generateRouteEntry = (route: RouteInfo): string => {
		const routeKey = route.path; // Use path only for websocket/sse, or METHOD path for API

		// If route doesn't have a validator, use never for schemas
		if (!route.hasValidator) {
			return `  '${routeKey}': {
    inputSchema: never;
    outputSchema: never;
  };`;
		}

		// If we have an agent variable, we can infer types from it
		if (route.agentVariable) {
			const importName = agentImports.get(route.agentVariable)!;
			return `  '${routeKey}': {
    inputSchema: typeof ${importName} extends { inputSchema?: infer I } ? I : never;
    outputSchema: typeof ${importName} extends { outputSchema?: infer O } ? O : never;
  };`;
		}

		// If we have standalone validator with schema variables
		if (route.inputSchemaVariable || route.outputSchemaVariable) {
			const inputType = route.inputSchemaVariable
				? `typeof ${route.inputSchemaVariable}`
				: 'never';
			const outputType = route.outputSchemaVariable
				? `typeof ${route.outputSchemaVariable}`
				: 'never';
			return `  '${routeKey}': {
    inputSchema: ${inputType};
    outputSchema: ${outputType};
  };`;
		}

		// Fall back to any if we can't determine the schema source
		return `  '${routeKey}': {
    // Unable to extract schema types - validator might use inline schemas
    inputSchema: any;
    outputSchema: any;
  };`;
	};

	// Generate RouteRegistry interface (API routes use METHOD path format)
	const apiRouteEntries = apiRoutes
		.map((route) => {
			const routeKey = `${route.method.toUpperCase()} ${route.path}`;
			return generateRouteEntry({ ...route, path: routeKey });
		})
		.join('\n');

	// Generate WebSocketRouteRegistry (path only, no method)
	const websocketRouteEntries = websocketRoutes.map(generateRouteEntry).join('\n');

	// Generate SSERouteRegistry (path only, no method)
	const sseRouteEntries = sseRoutes.map(generateRouteEntry).join('\n');

	const generatedContent = `// Auto-generated by Agentuity - do not edit manually
${importsStr}

// Augment @agentuity/react types with project-specific routes
declare module '@agentuity/react' {
  export interface RouteRegistry {
${apiRouteEntries}
  }
  
  export interface WebSocketRouteRegistry {
${websocketRouteEntries}
  }
  
  export interface SSERouteRegistry {
${sseRouteEntries}
  }
}
`;

	// Get the project root (parent of srcDir)
	const projectRoot = join(srcDir, '..');
	const agentuityDir = join(projectRoot, '.agentuity');
	const registryPath = join(agentuityDir, 'routes.generated.ts');

	// Ensure .agentuity directory exists
	if (!existsSync(agentuityDir)) {
		mkdirSync(agentuityDir, { recursive: true });
	}

	writeFileSync(registryPath, generatedContent, 'utf-8');
}
