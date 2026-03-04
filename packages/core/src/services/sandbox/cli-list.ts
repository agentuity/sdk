import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { SandboxResponseError } from './util.ts';

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

export const CLISandboxListOptionsSchema = z.object({
	/** Filter by sandbox name */
	name: z.string().optional().describe('Filter by sandbox name'),
	/** Filter by sandbox mode */
	mode: z.enum(['oneshot', 'interactive']).optional().describe('Filter by sandbox mode'),
	/** Filter by specific project ID */
	projectId: z.string().optional().describe('Filter by specific project ID'),
	/** Filter by specific organization ID */
	orgId: z.string().optional().describe('Filter by specific organization ID'),
	/** Filter by sandbox status */
	status: z
		.enum(['creating', 'idle', 'running', 'paused', 'stopping', 'suspended', 'terminated', 'failed'])
		.optional()
		.describe('Filter by sandbox status'),
	/** Maximum number of sandboxes to return (default: 50, max: 100) */
	limit: z.number().optional().describe('Maximum number of sandboxes to return (default: 50, max: 100)'),
	/** Number of sandboxes to skip for pagination */
	offset: z.number().optional().describe('Number of sandboxes to skip for pagination'),
	/** Field to sort by */
	sort: z.string().optional().describe('Field to sort by'),
	/** Sort direction (default: desc) */
	direction: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
});
export type CLISandboxListOptions = z.infer<typeof CLISandboxListOptionsSchema>;

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
