import { existsSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { toCamelCase } from '../../utils/string';

/**
 * Information about a discovered route file
 */
export interface DiscoveredRouteFile {
	/** Full path to the route file */
	filepath: string;
	/** Relative path from apiDir (e.g., 'auth/route.ts', 'v1/users/route.ts') */
	relativePath: string;
	/** Mount path for the route (e.g., '/api/auth', '/api/v1/users') */
	mountPath: string;
	/** Safe variable name for importing (e.g., 'authRoute', 'v1UsersRoute') */
	variableName: string;
	/** Import path relative to build output (e.g., './src/api/auth/route') */
	importPath: string;
}

/**
 * Recursively discover all TypeScript route files in an API directory
 * Supports nested structures like:
 * - src/api/index.ts (root API router)
 * - src/api/auth/route.ts -> mounted at /api/auth
 * - src/api/v1/users/route.ts -> mounted at /api/v1/users
 * - src/api/admin/users/login.ts -> mounted at /api/admin/users (any .ts file works)
 *
 * @param apiDir - Absolute path to the src/api directory
 * @param currentDir - Current directory being scanned (used for recursion)
 * @param results - Accumulated results (used for recursion)
 * @returns Array of discovered route files with mount information
 */
export function discoverRouteFiles(
	apiDir: string,
	currentDir: string = apiDir,
	results: DiscoveredRouteFile[] = []
): DiscoveredRouteFile[] {
	if (!existsSync(currentDir)) {
		return results;
	}

	const entries = readdirSync(currentDir);

	for (const entry of entries) {
		const entryPath = join(currentDir, entry);
		const stat = lstatSync(entryPath);

		// Skip symlinks to prevent infinite recursion
		if (stat.isSymbolicLink()) {
			continue;
		}

		if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.generated.ts')) {
			// Found a TypeScript file
			const relativePath = relative(apiDir, entryPath);
			const isRootIndex = relativePath === 'index.ts';

			// Skip root index.ts - it's handled separately
			if (isRootIndex) {
				continue;
			}

			// For subdirectory files, determine mount path
			// src/api/auth/route.ts -> /api/auth
			// src/api/v1/users/route.ts -> /api/v1/users
			// src/api/admin/login.ts -> /api/admin
			const pathParts = relativePath.split('/');
			pathParts.pop(); // Remove filename

			// Skip files directly in src/api/ to avoid mount path conflicts with root index.ts
			if (pathParts.length === 0) {
				continue;
			}

			const mountPath = `/api/${pathParts.join('/')}`;

			// Generate safe variable name
			// auth/route.ts -> authRoute
			// v1/users/route.ts -> v1UsersRoute
			// admin/login.ts -> adminLoginRoute
			const variableParts = pathParts.map((p, idx) => {
				const camel = toCamelCase(p);
				// Capitalize first letter of all parts except the first
				return idx === 0 ? camel : camel.charAt(0).toUpperCase() + camel.slice(1);
			});
			const baseName = entry.replace('.ts', '');
			if (baseName !== 'route' && baseName !== 'index') {
				const camelBase = toCamelCase(baseName);
				// Always capitalize the base name since it's not the first part
				variableParts.push(camelBase.charAt(0).toUpperCase() + camelBase.slice(1));
			}
			const variableName = variableParts.join('') + 'Route';

			// Generate import path relative to build output
			// src/api/auth/route.ts -> ./src/api/auth/route
			const importPath = './src/api/' + relativePath.replace('.ts', '');

			results.push({
				filepath: entryPath,
				relativePath,
				mountPath,
				variableName,
				importPath,
			});
		} else if (stat.isDirectory()) {
			// Recursively scan subdirectories
			discoverRouteFiles(apiDir, entryPath, results);
		}
	}

	return results;
}

/**
 * Detect potential route path conflicts
 *
 * @param routes - Array of route metadata with method and path
 * @returns Array of conflict descriptions
 */
export interface RouteConflict {
	type: 'duplicate' | 'ambiguous-param' | 'wildcard-overlap';
	routes: Array<{ method: string; path: string; filename: string }>;
	message: string;
}

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

	// Check for ambiguous parameter routes (same method, different param names)
	// e.g., GET /users/:id and GET /users/:userId
	const methodGroups = new Map<string, Array<{ path: string; filename: string }>>();
	for (const route of routes) {
		const method = route.method.toUpperCase();
		if (!methodGroups.has(method)) {
			methodGroups.set(method, []);
		}
		methodGroups.get(method)!.push({ path: route.path, filename: route.filename });
	}

	for (const [method, routeList] of methodGroups.entries()) {
		// Normalize params to check for conflicts
		const normalized = routeList.map((r) => ({
			...r,
			normalizedPath: r.path.replace(/:[^/]+/g, ':param'),
		}));

		const pathMap = new Map<string, Array<{ path: string; filename: string }>>();
		for (const route of normalized) {
			if (!pathMap.has(route.normalizedPath)) {
				pathMap.set(route.normalizedPath, []);
			}
			pathMap.get(route.normalizedPath)!.push({ path: route.path, filename: route.filename });
		}

		for (const [normalizedPath, paths] of pathMap.entries()) {
			if (paths.length > 1 && normalizedPath.includes(':param')) {
				// Check if the actual param names differ
				const uniquePaths = new Set(paths.map((p) => p.path));
				if (uniquePaths.size > 1) {
					conflicts.push({
						type: 'ambiguous-param',
						routes: paths.map(({ path, filename }) => ({ method, path, filename })),
						message: `Ambiguous param routes: ${method} ${Array.from(uniquePaths).join(', ')}`,
					});
				}
			}
		}
	}

	return conflicts;
}
