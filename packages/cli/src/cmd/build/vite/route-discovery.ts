/**
 * Route Discovery - READ-ONLY AST analysis
 *
 * Discovers routes by scanning src/api/**\/*.ts files or by following
 * explicit router mounts from createApp({ router }).
 * Extracts route definitions WITHOUT mutating source files.
 */

import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '../../../types';
import { parseRoute } from '../ast';
import { toForwardSlash } from '../../../utils/normalize-path';
import { detectExplicitRouter, type AppRouterDetection } from '../app-router-detector';

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
	agentName?: string;
	agentDescription?: string;
	inputSchemaVariable?: string;
	outputSchemaVariable?: string;
	inputSchemaImportPath?: string;
	inputSchemaImportedName?: string;
	outputSchemaImportPath?: string;
	outputSchemaImportedName?: string;
	inputSchemaCode?: string;
	outputSchemaCode?: string;
	stream?: boolean;
	pathParams?: string[];
}

/**
 * Extract path parameters from a route path.
 * Matches patterns like :id, :userId, :id?, *path, etc.
 */
export function extractPathParams(path: string): string[] {
	const params: string[] = [];
	const parts = path.split('/');
	for (const part of parts) {
		if (part.startsWith(':')) {
			params.push(part.replace(/^:|[?+*]$/g, ''));
		} else if (part.startsWith('*') && part.length > 1) {
			params.push(part.substring(1).replace(/[?+*]$/g, ''));
		}
	}
	return params;
}

/**
 * Discover all routes — tries explicit router detection first, falls back to file-based.
 *
 * When `createApp({ router })` is detected in app.ts, routes are discovered by
 * following the router imports with code-derived mount paths. Otherwise, falls back
 * to scanning src/api/**\/*.ts with filesystem-derived paths.
 */
export async function discoverRoutes(
	srcDir: string,
	projectId: string,
	deploymentId: string,
	logger: Logger
): Promise<{
	routes: RouteMetadata[];
	routeInfoList: RouteInfo[];
	/** Whether explicit router was detected (vs file-based fallback) */
	explicitRouter?: AppRouterDetection;
}> {
	const rootDir = join(srcDir, '..');

	// Try explicit router detection first
	const detection = await detectExplicitRouter(rootDir, logger);
	if (detection.detected && detection.mounts.length > 0) {
		logger.debug(
			'Using explicit router detection (%d mount(s) from createApp)',
			detection.mounts.length
		);
		const result = await discoverExplicitRoutes(
			rootDir,
			srcDir,
			projectId,
			deploymentId,
			detection,
			logger
		);
		return { ...result, explicitRouter: detection };
	}

	// Fall back to file-based discovery
	return discoverFileBasedRoutes(srcDir, projectId, deploymentId, logger);
}

/**
 * Discover routes from explicit router mounts detected in app.ts.
 * Parses each router file with its code-derived mount prefix.
 */
async function discoverExplicitRoutes(
	rootDir: string,
	srcDir: string,
	projectId: string,
	deploymentId: string,
	detection: AppRouterDetection,
	logger: Logger
): Promise<{ routes: RouteMetadata[]; routeInfoList: RouteInfo[] }> {
	const routes: RouteMetadata[] = [];
	const routeInfoList: RouteInfo[] = [];
	const visited = new Set<string>();
	const mountedSubrouters = new Set<string>();

	for (const mount of detection.mounts) {
		try {
			const parsedRoutes = await parseRoute(rootDir, mount.routerFile, projectId, deploymentId, {
				visitedFiles: visited,
				mountedSubrouters,
				mountPrefix: mount.path,
			});

			if (parsedRoutes.length > 0) {
				const relFile = './' + toForwardSlash(relative(srcDir, mount.routerFile));
				logger.trace(
					'Discovered %d route(s) from explicit mount at %s (%s)',
					parsedRoutes.length,
					mount.path,
					relFile
				);
				routes.push(...parsedRoutes);

				for (const route of parsedRoutes) {
					const pathParams = extractPathParams(route.path);
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
						inputSchemaImportPath: route.config?.inputSchemaImportPath as string | undefined,
						inputSchemaImportedName: route.config?.inputSchemaImportedName as
							| string
							| undefined,
						outputSchemaImportPath: route.config?.outputSchemaImportPath as
							| string
							| undefined,
						outputSchemaImportedName: route.config?.outputSchemaImportedName as
							| string
							| undefined,
						stream:
							route.config?.stream !== undefined && route.config.stream !== null
								? Boolean(route.config.stream)
								: route.type === 'stream'
									? true
									: undefined,
						pathParams: pathParams.length > 0 ? pathParams : undefined,
					});
				}
			}
		} catch (error) {
			logger.warn(
				'Failed to parse explicit router at %s: %s',
				mount.routerFile,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	logger.debug('Discovered %d route(s) via explicit router detection', routes.length);

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

/**
 * Discover routes by scanning src/api directory (original file-based approach).
 */
async function discoverFileBasedRoutes(
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

	// Track files that are mounted as sub-routers via .route()
	// These files will be parsed standalone AND via .route() — we need to deduplicate
	const mountedSubrouters = new Set<string>();

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
			const relativeFilename = './' + toForwardSlash(relative(srcDir, filePath));

			try {
				const parsedRoutes = await parseRoute(
					rootDir,
					filePath,
					projectId,
					deploymentId,
					undefined,
					mountedSubrouters
				);

				if (parsedRoutes.length > 0) {
					logger.trace('Discovered %d route(s) in %s', parsedRoutes.length, relativeFilename);
					routes.push(...parsedRoutes);

					// Convert to RouteInfo for registry
					for (const route of parsedRoutes) {
						const pathParams = extractPathParams(route.path);
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
							inputSchemaImportPath: route.config?.inputSchemaImportPath as
								| string
								| undefined,
							inputSchemaImportedName: route.config?.inputSchemaImportedName as
								| string
								| undefined,
							outputSchemaImportPath: route.config?.outputSchemaImportPath as
								| string
								| undefined,
							outputSchemaImportedName: route.config?.outputSchemaImportedName as
								| string
								| undefined,
							stream:
								route.config?.stream !== undefined && route.config.stream !== null
									? Boolean(route.config.stream)
									: route.type === 'stream'
										? true
										: undefined,
							pathParams: pathParams.length > 0 ? pathParams : undefined,
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

	// Filter out routes from standalone-parsed sub-router files
	// When a file is mounted via .route(), its standalone routes have wrong prefixes
	// Only the .route()-prefixed routes (attached to the parent file) are correct
	if (mountedSubrouters.size > 0) {
		const rootDir = join(srcDir, '..');
		const subrouterRelPaths = new Set<string>();
		for (const absPath of mountedSubrouters) {
			subrouterRelPaths.add(toForwardSlash(relative(rootDir, absPath)));
		}

		// Remove routes whose filename matches a sub-router file
		// (these are the incorrectly-prefixed standalone routes)
		const filteredRoutes = routes.filter((r) => !subrouterRelPaths.has(r.filename));
		const filteredRouteInfoList = routeInfoList.filter((r) => !subrouterRelPaths.has(r.filename));

		// Replace arrays in-place
		routes.length = 0;
		routes.push(...filteredRoutes);
		routeInfoList.length = 0;
		routeInfoList.push(...filteredRouteInfoList);
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
	type: 'duplicate';
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
			const [method = 'UNKNOWN'] = methodPath.split(' ', 2);
			conflicts.push({
				type: 'duplicate',
				routes: routeList.map((r) => ({ method, path: r.path, filename: r.filename })),
				message: `Duplicate route: ${methodPath} defined in ${routeList.length} files`,
			});
		}
	}

	return conflicts;
}
