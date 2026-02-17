import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError } from './util';

export const SandboxInfoSchema = z.object({
	id: z.string().describe('the sandbox id'),
	name: z.string().nullable().describe('the sandbox name'),
	description: z.string().nullable().describe('the sandbox description'),
	status: z.string().describe('sandbox status'),
	region: z.string().nullable().describe('cloud region'),
	createdAt: z.string().nullable().describe('ISO 8601 creation timestamp'),
	orgId: z.string().describe('the organization id'),
	orgName: z.string().nullable().describe('the organization name'),
	projectId: z.string().nullable().describe('the project id'),
});

export const SandboxListDataSchema = z.object({
	sandboxes: z.array(SandboxInfoSchema).describe('list of sandboxes'),
	total: z.number().describe('total count of matching sandboxes'),
});

export const SandboxListResponseSchema = APIResponseSchema(SandboxListDataSchema);

export type CLISandboxListResponse = z.infer<typeof SandboxListResponseSchema>;
export type CLISandboxListData = z.infer<typeof SandboxListDataSchema>;
export type CLISandboxInfo = z.infer<typeof SandboxInfoSchema>;

export interface CLISandboxListOptions {
	/**
	 * Filter by sandbox name
	 */
	name?: string;
	/**
	 * Filter by sandbox mode
	 */
	mode?: 'oneshot' | 'interactive';
	/**
	 * Filter by specific project ID
	 */
	projectId?: string;
	/**
	 * Filter by specific organization ID
	 */
	orgId?: string;
	/**
	 * Filter by sandbox status
	 */
	status?: 'creating' | 'idle' | 'running' | 'terminated' | 'failed';
	/**
	 * Maximum number of sandboxes to return (default: 50, max: 100)
	 */
	limit?: number;
	/**
	 * Number of sandboxes to skip for pagination
	 */
	offset?: number;
	/**
	 * Field to sort by
	 */
	sort?: string;
	/**
	 * Sort direction (default: 'desc')
	 */
	direction?: 'asc' | 'desc';
}

/**
 * List sandboxes with optional filtering using the CLI API endpoint.
 *
 * This endpoint searches across all organizations the user is a member of,
 * unlike the Catalyst API which requires an orgId.
 *
 * @param client - The API client
 * @param options - Filtering and pagination options
 * @returns A promise that resolves to the list of sandboxes
 *
 * @example
 * // List all sandboxes across all orgs
 * const result = await cliSandboxList(client);
 * console.log(`Found ${result.total} sandboxes`);
 *
 * @example
 * // List running sandboxes
 * const result = await cliSandboxList(client, { status: 'running' });
 *
 * @example
 * // List sandboxes for a specific project
 * const result = await cliSandboxList(client, { projectId: 'proj_123' });
 */
export async function cliSandboxList(
	client: APIClient,
	options: CLISandboxListOptions = {}
): Promise<CLISandboxListData> {
	const { projectId, orgId, status, limit, offset, sort, direction } = options;
	const params = new URLSearchParams();

	if (options.name) params.set('name', options.name);
	if (options.mode) params.set('mode', options.mode);
	if (projectId) params.set('projectId', projectId);
	if (orgId) params.set('orgId', orgId);
	if (status) params.set('status', status);
	if (limit !== undefined) params.set('limit', limit.toString());
	if (offset !== undefined) params.set('offset', offset.toString());
	if (sort) params.set('sort', sort);
	if (direction) params.set('direction', direction);

	const queryString = params.toString();
	const resp = await client.request<CLISandboxListResponse>(
		'GET',
		`/cli/sandbox${queryString ? `?${queryString}` : ''}`,
		SandboxListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new SandboxResponseError({ message: resp.message });
}
