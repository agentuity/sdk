import { StructuredError } from '@agentuity/core';
import { APIClient } from '../api';
import { getServiceUrls } from '../../config';
import { createLogger } from '../../logger';

/** API version for usage endpoints. */
const USAGE_API_VERSION = '2025-03-17';

/**
 * General usage operation error.
 *
 * Thrown when a usage API operation fails for reasons other than not-found.
 *
 * @example
 * ```typescript
 * try {
 *   await getUsageSummary(client, 'proj_abc123', options);
 * } catch (error) {
 *   if (error instanceof UsageError) {
 *     console.error(`Usage operation failed: ${error.message}`);
 *   }
 * }
 * ```
 */
export const UsageError = StructuredError('UsageError')<{ projectId?: string }>();

/**
 * Error thrown when a project is not found for usage queries.
 *
 * @example
 * ```typescript
 * try {
 *   await getUsageSummary(client, 'proj_nonexistent', options);
 * } catch (error) {
 *   if (error instanceof UsageNotFoundError) {
 *     console.error(`Project not found: ${error.projectId}`);
 *   }
 * }
 * ```
 */
export const UsageNotFoundError = StructuredError('UsageNotFoundError')<{ projectId: string }>();

/**
 * Build the URL path for a usage endpoint.
 *
 * @param projectId - The project ID
 * @param action - The endpoint action (e.g., 'summary', 'breakdown', 'timeseries')
 * @returns The full API path with version prefix
 *
 * @internal
 */
export function usageApiPath(projectId: string, action: string): string {
	return `/usage/${USAGE_API_VERSION}/${encodeURIComponent(projectId)}/${action}`;
}

/**
 * Build headers with optional orgId for usage API requests.
 *
 * @param orgId - Optional organization ID for CLI authentication
 * @returns Headers object to pass to API client, or undefined if no orgId
 *
 * @internal
 */
export function buildUsageHeaders(orgId?: string): Record<string, string> | undefined {
	if (orgId) {
		return { 'x-agentuity-orgid': orgId };
	}
	return undefined;
}

/**
 * Resolve the project ID from an explicit parameter or the environment.
 *
 * When running inside an Agentuity project, the `AGENTUITY_CLOUD_PROJECT_ID`
 * environment variable is set automatically. This function allows callers
 * to omit `projectId` and have it resolved from the environment.
 *
 * @param projectId - Explicit project ID, or undefined to resolve from environment
 * @returns The resolved project ID
 * @throws {UsageError} If no project ID is provided and the environment variable is not set
 *
 * @internal
 */
export function resolveProjectId(projectId?: string): string {
	if (projectId) return projectId;
	const envProjectId = process.env.AGENTUITY_CLOUD_PROJECT_ID;
	if (envProjectId) return envProjectId;
	throw new UsageError({
		message:
			'No project ID provided and AGENTUITY_CLOUD_PROJECT_ID is not set. ' +
			'Either pass a projectId or run inside an Agentuity project.',
	});
}

/**
 * Create an APIClient using environment variables.
 *
 * Resolves the Catalyst URL from `AGENTUITY_REGION` (via {@link getServiceUrls})
 * and uses `AGENTUITY_SDK_KEY` for authentication (picked up automatically by APIClient).
 *
 * @returns A configured APIClient pointing at the Catalyst service
 * @throws {Error} If `AGENTUITY_REGION` is not set
 *
 * @internal
 */
export function createDefaultClient(): APIClient {
	const urls = getServiceUrls();
	const logger = createLogger('warn');
	return new APIClient(urls.catalyst, logger);
}
