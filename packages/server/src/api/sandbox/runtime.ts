import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ListRuntimesParams, ListRuntimesResponse, SandboxRuntime } from '@agentuity/core';

const RuntimeInfoSchema = z
	.object({
		id: z.string().describe('Unique runtime identifier'),
		name: z.string().describe('Runtime name (e.g., "bun:1", "python:3.14")'),
		description: z.string().optional().describe('Optional description'),
		iconUrl: z.string().optional().describe('URL for runtime icon'),
		url: z.string().optional().describe('URL for runtime documentation or homepage'),
		tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
	})
	.describe('Information about a sandbox runtime');

const ListRuntimesDataSchema = z
	.object({
		runtimes: z.array(RuntimeInfoSchema).describe('List of runtime entries'),
		total: z.number().describe('Total number of runtimes'),
	})
	.describe('List of sandbox runtimes');

const ListRuntimesResponseSchema = APIResponseSchema(ListRuntimesDataSchema);

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

	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}/runtimes${queryString ? `?${queryString}` : ''}`;

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
					url: r.url,
					tags: r.tags,
				})
			),
			total: resp.data.total,
		};
	}

	throw new SandboxResponseError({ message: resp.message });
}
