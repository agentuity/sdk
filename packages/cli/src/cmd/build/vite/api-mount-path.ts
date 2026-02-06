/**
 * API Mount Path Utilities
 *
 * Shared helpers for computing API route mount paths from file paths.
 * Used by both entry-generator.ts (runtime mounting) and ast.ts (type generation)
 * to ensure consistent path calculation.
 */

/**
 * Compute the API mount path from a route file's relative path.
 * This is the path used in app.route(mountPath, router).
 *
 * The mount path is based on the DIRECTORY containing the file, not the filename.
 * Files directly in src/api/ (regardless of their name) mount at /api.
 * Files in subdirectories mount at /api/{subdirectory}.
 *
 * @param relativePath - Path relative to src/api/ without extension
 *                       e.g., 'index', 'sessions', 'auth/route', 'users/profile/route'
 * @returns Mount path like '/api', '/api/auth', '/api/users/profile'
 *
 * @example
 * computeApiMountPath('index')              // '/api' (file in src/api/)
 * computeApiMountPath('sessions')           // '/api' (file in src/api/)
 * computeApiMountPath('route')              // '/api' (file in src/api/)
 * computeApiMountPath('auth/route')         // '/api/auth' (file in src/api/auth/)
 * computeApiMountPath('auth/index')         // '/api/auth' (file in src/api/auth/)
 * computeApiMountPath('users/profile/route') // '/api/users/profile' (file in src/api/users/profile/)
 */
export function computeApiMountPath(relativePath: string): string {
	// Extract the directory path (everything before the last /)
	const lastSlashIndex = relativePath.lastIndexOf('/');
	if (lastSlashIndex === -1) {
		// File is directly in src/api/ (e.g., 'index', 'sessions', 'route')
		return '/api';
	}

	// File is in a subdirectory (e.g., 'auth/route' -> 'auth')
	const dirPath = relativePath.substring(0, lastSlashIndex);
	return `/api/${dirPath}`;
}

/**
 * Join a mount base path with a route's local path.
 * Handles normalization of slashes and empty/root paths.
 *
 * @param base - The mount base path (e.g., '/api/sessions')
 * @param route - The local route path (e.g., '/', '/users', ':id')
 * @returns The combined full path
 *
 * @example
 * joinMountAndRoute('/api/sessions', '/')      // '/api/sessions'
 * joinMountAndRoute('/api/sessions', '/users') // '/api/sessions/users'
 * joinMountAndRoute('/api', '/health')         // '/api/health'
 * joinMountAndRoute('/api/users', ':id')       // '/api/users/:id'
 */
export function joinMountAndRoute(base: string, route: string): string {
	if (!route || route === '/') {
		return base;
	}
	const normalized = route.startsWith('/') ? route : `/${route}`;
	return `${base}${normalized}`.replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

import { join, relative } from 'node:path';

/**
 * Extract the relative path from a full file path to src/api/.
 * Normalizes path separators for cross-platform compatibility.
 *
 * @param filename - Full path to the route file
 * @param srcDir - Path to the src directory
 * @returns Path relative to src/api/ without extension
 *
 * @example
 * // Given srcDir = '/project/src'
 * extractRelativeApiPath('/project/src/api/sessions.ts', '/project/src')
 * // Returns: 'sessions'
 *
 * extractRelativeApiPath('/project/src/api/auth/route.ts', '/project/src')
 * // Returns: 'auth/route'
 */
export function extractRelativeApiPath(filename: string, srcDir: string): string {
	const apiDir = join(srcDir, 'api');
	return relative(apiDir, filename)
		.replace(/\\/g, '/') // Normalize Windows paths
		.replace(/\.tsx?$/, ''); // Remove extension
}
