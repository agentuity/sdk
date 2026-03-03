import type {
	ListRuntimesParams,
	ListRuntimesResponse,
	SandboxRuntime,
} from '../../services/sandbox.ts';
import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { throwSandboxError } from './util.ts';

export const RuntimeRequirementsSchema = z
	.object({
		memory: z.string().optional().describe('Memory requirement (e.g., "1Gi")'),
		cpu: z.string().optional().describe('CPU requirement (e.g., "1")'),
		disk: z.string().optional().describe('Disk requirement (e.g., "500Mi")'),
		networkEnabled: z.boolean().describe('Whether network access is enabled'),
	})
	.describe('Runtime resource requirements');

export const RuntimeInfoSchema = z
	.object({
		id: z.string().describe('Unique runtime identifier'),
		name: z.string().describe('Runtime name (e.g., "bun:1", "python:3.14")'),
		description: z.string().optional().describe('Optional description'),
		iconUrl: z.string().optional().describe('URL for runtime icon'),
		brandColor: z.string().optional().describe('Brand color for the runtime (hex color code)'),
		url: z.string().optional().describe('URL for runtime documentation or homepage'),
		tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
		requirements: RuntimeRequirementsSchema.optional().describe('Runtime resource requirements'),
		readme: z.string().optional().describe('Readme content in markdown format'),
	})
	.describe('Information about a sandbox runtime');

export const ListRuntimesDataSchema = z
	.object({
		runtimes: z.array(RuntimeInfoSchema).describe('List of runtime entries'),
		total: z.number().describe('Total number of runtimes'),
	})
	.describe('List of sandbox runtimes');

export const ListRuntimesResponseSchema = APIResponseSchema(ListRuntimesDataSchema);

export interface RuntimeListParams extends ListRuntimesParams {
	orgId?: string;
}

/**
 * Lists available sandbox runtimes with optional pagination.
 *
 * @param client - The API client to use for the request
 * @param params - Optional parameters for pagination
 * @returns List of runtimes with total count
 * @throws {SandboxResponseError} If the request fails
 */
export async function runtimeList(
	client: APIClient,
	params?: RuntimeListParams
): Promise<ListRuntimesResponse> {
	const queryParams = new URLSearchParams();

	if (params?.orgId) {
		queryParams.set('orgId', params.orgId);
	}
	if (params?.limit !== undefined) {
		queryParams.set('limit', params.limit.toString());
	}
	if (params?.offset !== undefined) {
		queryParams.set('offset', params.offset.toString());
	}
	if (params?.sort) {
		queryParams.set('sort', params.sort);
	}
	if (params?.direction) {
		queryParams.set('direction', params.direction);
	}

	const queryString = queryParams.toString();
	const url = `/sandbox/runtimes${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ListRuntimesResponseSchema>>(
		url,
		ListRuntimesResponseSchema
	);

	if (resp.success) {
		return {
			runtimes: resp.data.runtimes.map(
				(r): SandboxRuntime => ({
					id: r.id,
					name: r.name,
					description: r.description,
					iconUrl: r.iconUrl,
					brandColor: r.brandColor,
					url: r.url,
					tags: r.tags,
					requirements: r.requirements,
					readme: r.readme,
				})
			),
			total: resp.data.total,
		};
	}

	throwSandboxError(resp, {});
}
