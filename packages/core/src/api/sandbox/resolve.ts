import { StructuredError } from '../../error.ts';
import { z } from 'zod';
import { type APIClient, APIResponseSchemaOptionalData } from '../api.ts';

/**
 * Data schema for sandbox resolve endpoint
 */
export const SandboxResolveDataSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	region: z.string(),
	status: z.string(),
	orgId: z.string(),
	projectId: z.string().nullable(),
});

/**
 * Response schema for sandbox resolve endpoint using standardized discriminated union
 */
export const SandboxResolveResponseSchema = APIResponseSchemaOptionalData(SandboxResolveDataSchema);

/**
 * Resolved sandbox info returned from the CLI API
 */
export interface ResolvedSandboxInfo {
	id: string;
	name: string | null;
	region: string;
	status: string;
	orgId: string;
	projectId: string | null;
}

/**
 * Error thrown when sandbox resolution fails.
 *
 * @example
 * ```typescript
 * try {
 *   await sandboxResolve(client, 'sbx_123');
 * } catch (error) {
 *   if (error._tag === 'SandboxResolveError') {
 *     console.error(`Sandbox not found: ${error.sandboxId}`);
 *   }
 * }
 * ```
 */
export const SandboxResolveError = StructuredError('SandboxResolveError')<{
	sandboxId?: string;
	statusCode?: number;
}>();

/**
 * Resolve a sandbox by ID across all organizations the user has access to.
 * Uses the CLI API endpoint which searches across all user's orgs.
 *
 * @param client - API client configured for CLI endpoints
 * @param sandboxId - The sandbox ID to resolve
 * @returns Resolved sandbox info including region and orgId
 * @throws {SandboxResolveError} If sandbox not found or request fails
 */
export async function sandboxResolve(
	client: APIClient,
	sandboxId: string
): Promise<ResolvedSandboxInfo> {
	const response = await client.get<z.infer<typeof SandboxResolveResponseSchema>>(
		`/cli/sandbox/${sandboxId}`,
		SandboxResolveResponseSchema
	);

	if (!response.success) {
		// Extract status code from error code if present (e.g., "NOT_FOUND" -> 404)
		// Fall back to 404 if no code is provided
		const statusCode = response.code === 'NOT_FOUND' ? 404 : response.code ? 400 : 404;
		throw new SandboxResolveError({
			message: response.message || 'Sandbox not found',
			sandboxId,
			statusCode,
		});
	}

	if (!response.data) {
		throw new SandboxResolveError({
			message: 'Sandbox not found',
			sandboxId,
			statusCode: 404,
		});
	}

	return {
		id: response.data.id,
		name: response.data.name,
		region: response.data.region,
		status: response.data.status,
		orgId: response.data.orgId,
		projectId: response.data.projectId,
	};
}
