import { z } from 'zod';
import { APIResponseSchema, APIClient } from '../api.ts';
import { RegionResponseError } from './util.ts';

export const ListRegionsResponse = z.array(
	z.object({
		region: z.string().describe('the region identifier'),
		description: z.string().describe('the human-readable description of the region'),
	})
);
export const ListRegionsResponseSchema = APIResponseSchema(ListRegionsResponse);

export type ListRegionsResponse = z.infer<typeof ListRegionsResponseSchema>;
export type RegionList = z.infer<typeof ListRegionsResponse>;

/**
 * List all available cloud regions
 *
 * @param client
 * @returns
 */
export async function listRegions(client: APIClient): Promise<RegionList> {
	const resp = await client.request<ListRegionsResponse>(
		'GET',
		'/cli/region',
		ListRegionsResponseSchema
	);
	if (resp.success) {
		return resp.data;
	}
	throw new RegionResponseError({ message: resp.message });
}
