import type { Project } from '@agentuity/server/index.ts';

/**
 * In-memory cache for project data to avoid duplicate API calls within a single CLI command execution.
 * This cache is NOT persisted to disk - it only lives for the duration of the CLI process.
 *
 * The cache key is `{profile}:{projectId}` to ensure proper isolation between profiles.
 */
const projectCache = new Map<string, Project>();

/**
 * Generate a cache key from profile and project ID
 */
function getCacheKey(profile: string, projectId: string): string {
	return `${profile}:${projectId}`;
}

/**
 * Get a cached project by profile and project ID.
 * Returns null if not found in cache.
 */
export function getCachedProject(profile: string, projectId: string): Project | null {
	const key = getCacheKey(profile, projectId);
	return projectCache.get(key) ?? null;
}

/**
 * Store a project in the cache.
 */
export function setCachedProject(profile: string, projectId: string, project: Project): void {
	const key = getCacheKey(profile, projectId);
	projectCache.set(key, project);
}

/**
 * Clear all cached projects.
 * Useful for testing or when switching contexts.
 */
export function clearProjectCache(): void {
	projectCache.clear();
}
