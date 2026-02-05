import { z } from 'zod';
import { StructuredError } from '@agentuity/core';
import type { APIClient } from '../api';

/**
 * Response schema for sandbox resolve endpoint
 */
const SandboxResolveResponseSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	data: z
		.object({
			id: z.string(),
			name: z.string().nullable(),
			region: z.string(),
			status: z.string(),
			orgId: z.string(),
			projectId: z.string().nullable(),
		})
		.optional(),
});

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

	if (!response.success || !response.data) {
		throw new SandboxResolveError({
			message: response.message || 'Sandbox not found',
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
