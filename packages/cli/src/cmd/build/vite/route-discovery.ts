/**
 * Route Discovery — Explicit Routing Only
 *
 * Discovers routes from `createApp({ router })` by importing the router
 * module at build time and reading `router.routes` from the Hono instance.
 *
 * File-based routing (scanning src/api/**) is no longer supported.
 */

import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type { Logger } from '../../../types';
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
	/**
	 * When a route is mounted via .route(), its filename is set to the parent file
	 * (for dedup filtering). schemaSourceFile preserves the actual file where the
	 * route's schema variables are defined/exported, so registry imports resolve correctly.
	 */
	schemaSourceFile?: string;
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
 * Generate a deterministic route ID from project/deployment/path/method.
 */
function generateRouteId(
	projectId: string,
	deploymentId: string,
	path: string,
	method: string
): string {
	const hash = createHash('sha256')
		.update(`${projectId}:${deploymentId}:${path}:${method}`)
		.digest('hex')
		.substring(0, 16);
	return `routeid_${hash}`;
}

/**
 * Generate a version hash from file contents.
 */
async function generateFileVersion(filePath: string): Promise<string> {
	try {
		const content = await Bun.file(filePath).text();
		return createHash('sha256').update(content).digest('hex').substring(0, 16);
	} catch {
		return 'unknown';
	}
}

/**
 * Detect route type from handler metadata or method.
 * Checks for route-meta symbol stamped by handler wrappers (websocket, sse, stream, cron).
 */
function detectRouteType(handler: unknown): 'api' | 'websocket' | 'sse' | 'stream' | 'cron' {
	// Check for route-meta symbol (future: handler wrappers will tag this)
	if (typeof handler === 'function') {
		const meta = (handler as any)[Symbol.for('agentuity:route-meta')];
		if (meta?.type) {
			return meta.type;
		}
	}

	// Heuristic: upgradeWebSocket handler has a specific name
	if (typeof handler === 'function' && handler.name === 'upgradeWebSocket') {
		return 'websocket';
	}

	return 'api';
}

/**
 * Discover all routes from explicit router mounts in createApp({ router }).
 *
 * Imports each router module at build time and reads `router.routes` from
 * the Hono instance to extract method, path, and route type.
 *
 * @throws If no explicit router is detected in app.ts
 */
export async function discoverRoutes(
	srcDir: string,
	projectId: string,
	deploymentId: string,
	logger: Logger
): Promise<{
	routes: RouteMetadata[];
	routeInfoList: RouteInfo[];
	explicitRouter?: AppRouterDetection;
}> {
	const rootDir = join(srcDir, '..');

	const detection = await detectExplicitRouter(rootDir, logger);
	if (!detection.detected || detection.mounts.length === 0) {
		logger.debug('No explicit router detected in createApp() — no routes to discover');
		return { routes: [], routeInfoList: [] };
	}

	logger.debug(
		'Using explicit router detection (%d mount(s) from createApp)',
		detection.mounts.length
	);

	const routes: RouteMetadata[] = [];
	const routeInfoList: RouteInfo[] = [];
	const seenRoutes = new Set<string>();

	for (const mount of detection.mounts) {
		try {
			// Import the router module at build time
			const routerModule = await import(mount.routerFile);
			const router = routerModule.default ?? routerModule;

			// Validate it's a Hono instance with routes
			if (!router || !Array.isArray(router.routes)) {
				logger.warn(
					'Router module at %s does not export a Hono instance with routes',
					mount.routerFile
				);
				continue;
			}

			const relFile = './' + toForwardSlash(relative(srcDir, mount.routerFile));
			const version = await generateFileVersion(mount.routerFile);

			// Filter to actual route handlers (not middleware — middleware uses '*' or ALL method)
			const routeEntries = router.routes.filter(
				(r: any) => r.method !== 'ALL' && r.path !== '*'
			);

			for (const route of routeEntries) {
				const method = String(route.method).toUpperCase();
				// Combine mount path with route path
				let fullPath = route.path;
				if (mount.path !== '/' && !fullPath.startsWith(mount.path)) {
					fullPath = mount.path + (fullPath.startsWith('/') ? fullPath : '/' + fullPath);
				}

				// Deduplicate (Hono may register same route multiple times for middleware)
				const routeKey = `${method} ${fullPath}`;
				if (seenRoutes.has(routeKey)) continue;
				seenRoutes.add(routeKey);

				const routeType = detectRouteType(route.handler);
				const pathParams = extractPathParams(fullPath);
				const id = generateRouteId(projectId, deploymentId, fullPath, method);

				routes.push({
					id,
					filename: toForwardSlash(relative(rootDir, mount.routerFile)),
					path: fullPath,
					method: method.toLowerCase(),
					version,
					type: routeType,
				});

				routeInfoList.push({
					method,
					path: fullPath,
					filename: toForwardSlash(relative(rootDir, mount.routerFile)),
					hasValidator: false,
					routeType,
					stream: routeType === 'stream' || routeType === 'sse' ? true : undefined,
					pathParams: pathParams.length > 0 ? pathParams : undefined,
				});
			}

			logger.trace(
				'Discovered %d route(s) from explicit mount at %s (%s)',
				routeEntries.length,
				mount.path,
				relFile
			);
		} catch (error) {
			logger.warn(
				'Failed to import router at %s: %s',
				mount.routerFile,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

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

	logger.debug('Discovered %d route(s) via explicit router detection', routes.length);
	return { routes, routeInfoList, explicitRouter: detection };
}

export interface RouteConflict {
	type: 'duplicate';
	routes: Array<{ method: string; path: string; filename: string }>;
	message: string;
}

/**
 * Detect conflicts between routes.
 */
export function detectRouteConflicts(
	routes: Array<{ method: string; path: string; filename: string }>
): RouteConflict[] {
	const conflicts: RouteConflict[] = [];

	const methodPathMap = new Map<string, Array<{ path: string; filename: string }>>();

	for (const route of routes) {
		const key = `${route.method.toUpperCase()} ${route.path}`;
		if (!methodPathMap.has(key)) {
			methodPathMap.set(key, []);
		}
		methodPathMap.get(key)!.push({ path: route.path, filename: route.filename });
	}

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
