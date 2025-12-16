/**
 * Route Discovery - READ-ONLY AST analysis
 *
 * Discovers routes by scanning src/api/**\/*.ts files
 * Extracts route definitions WITHOUT mutating source files
 */

import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '../../../types';
import { parseRoute } from '../ast';

export interface RouteMetadata {
	id: string;
	filename: string;
	path: string;
	method: string;
	version: string;
	type: 'api' | 'sms' | 'email' | 'cron' | 'websocket' | 'sse' | 'stream';
	agentIds?: string[];
	config?: Record<string, unknown>;
	schema?: {
		input?: string;
		output?: string;
	};
}

export interface RouteInfo {
	method: string;
	path: string;
	filename: string;
	hasValidator: boolean;
	routeType: 'api' | 'sms' | 'email' | 'cron' | 'websocket' | 'sse' | 'stream';
	agentVariable?: string;
	agentImportPath?: string;
	inputSchemaVariable?: string;
	outputSchemaVariable?: string;
	stream?: boolean;
}

/**
 * Discover all routes in src/api directory (READ-ONLY)
 */
export async function discoverRoutes(
	srcDir: string,
	projectId: string,
	deploymentId: string,
	logger: Logger
): Promise<{ routes: RouteMetadata[]; routeInfoList: RouteInfo[] }> {
	const apiDir = join(srcDir, 'api');
	const routes: RouteMetadata[] = [];
	const routeInfoList: RouteInfo[] = [];

	// Check if API directory exists
	if (!existsSync(apiDir)) {
		logger.trace('No api directory found at %s', apiDir);
		return { routes, routeInfoList };
	}

	const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });

	// Scan all .ts files in api directory
	const glob = new Bun.Glob('**/*.ts');
	for await (const file of glob.scan(apiDir)) {
		const filePath = join(apiDir, file);

		try {
			const source = await Bun.file(filePath).text();
			const contents = transpiler.transformSync(source);

			// Check if file has createRouter or Hono
			if (!contents.includes('createRouter') && !contents.includes('new Hono')) {
				logger.trace('Skipping %s (no router)', file);
				continue;
			}

			const rootDir = join(srcDir, '..');
			const relativeFilename = './' + relative(srcDir, filePath);

			try {
				const parsedRoutes = await parseRoute(rootDir, filePath, projectId, deploymentId);

				if (parsedRoutes.length > 0) {
					logger.trace('Discovered %d route(s) in %s', parsedRoutes.length, relativeFilename);
					routes.push(...parsedRoutes);

					// Convert to RouteInfo for registry
					for (const route of parsedRoutes) {
						routeInfoList.push({
							method: route.method.toUpperCase(),
							path: route.path,
							filename: route.filename,
							hasValidator: route.config?.hasValidator === true,
							routeType: route.type || 'api',
							agentVariable: route.config?.agentVariable as string | undefined,
							agentImportPath: route.config?.agentImportPath as string | undefined,
							inputSchemaVariable: route.config?.inputSchemaVariable as string | undefined,
							outputSchemaVariable: route.config?.outputSchemaVariable as string | undefined,
							stream:
								route.config?.stream !== undefined && route.config.stream !== null
									? Boolean(route.config.stream)
									: route.type === 'stream'
										? true
										: undefined,
						});
					}
				}
			} catch (error) {
				// Skip files that don't have proper router setup
				if (error instanceof Error) {
					if (
						error.message.includes('could not find default export') ||
						error.message.includes('could not find an proper createRouter')
					) {
						logger.trace('Skipping %s: %s', file, error.message);
					} else {
						throw error;
					}
				} else {
					throw error;
				}
			}
		} catch (error) {
			logger.warn(`Failed to parse route file ${filePath}: ${error}`);
		}
	}

	logger.debug('Discovered %d route(s)', routes.length);

	// Check for route conflicts
	const conflicts = detectRouteConflicts(routeInfoList);
	if (conflicts.length > 0) {
		logger.error('Route conflicts detected:');
		for (const conflict of conflicts) {
			logger.error('  %s', conflict.message);
			for (const route of conflict.routes) {
				logger.error('    - %s %s in %s', route.method, route.path, route.filename);
			}
		}
		throw new Error(
			`Found ${conflicts.length} route conflict(s). Fix the conflicts and try again.`
		);
	}

	return { routes, routeInfoList };
}

export interface RouteConflict {
	type: 'duplicate' | 'ambiguous';
	routes: Array<{ method: string; path: string; filename: string }>;
	message: string;
}

/**
 * Detect conflicts between routes
 */
export function detectRouteConflicts(
	routes: Array<{ method: string; path: string; filename: string }>
): RouteConflict[] {
	const conflicts: RouteConflict[] = [];

	// Group routes by method+path
	const methodPathMap = new Map<string, Array<{ path: string; filename: string }>>();

	for (const route of routes) {
		const key = `${route.method.toUpperCase()} ${route.path}`;
		if (!methodPathMap.has(key)) {
			methodPathMap.set(key, []);
		}
		methodPathMap.get(key)!.push({ path: route.path, filename: route.filename });
	}

	// Check for exact duplicates
	for (const [methodPath, routeList] of methodPathMap.entries()) {
		if (routeList.length > 1) {
			const [method] = methodPath.split(' ', 2);
			conflicts.push({
				type: 'duplicate',
				routes: routeList.map((r) => ({ method, path: r.path, filename: r.filename })),
				message: `Duplicate route: ${methodPath} defined in ${routeList.length} files`,
			});
		}
	}

	return conflicts;
}
