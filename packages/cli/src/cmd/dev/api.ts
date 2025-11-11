import { APIResponseSchema } from '@agentuity/server';
import { z } from 'zod';
import type { APIClient } from '../../api';

const DevmodeRequestSchema = z.object({
	hostname: z.string().optional().describe('the hostname for the endpoint'),
});

type DevmodeRequest = z.infer<typeof DevmodeRequestSchema>;

const DevmodeResponseSchema = z.object({
	id: z.string(),
	hostname: z.string(),
});
export type DevmodeResponse = z.infer<typeof DevmodeResponseSchema>;

const DevmodeResponseAPISchema = APIResponseSchema(DevmodeResponseSchema);
type DevmodeResponseAPI = z.infer<typeof DevmodeResponseAPISchema>;

/**
 * Generate an Endpoint ID and Hostname
 *
 * @param apiClient the api client to use
 * @param projectId the project id
 * @param hostname the hostname is already configured
 * @returns
 */
export async function generateEndpoint(
	apiClient: APIClient,
	projectId: string,
	hostname?: string
): Promise<DevmodeResponse> {
	const resp = await apiClient.request<DevmodeResponseAPI, DevmodeRequest>(
		'POST',
		`/cli/devmode/2/${projectId}`,
		DevmodeResponseAPISchema,
		{ hostname },
		DevmodeRequestSchema
	);

	if (!resp.success) {
		throw new Error(resp.message);
	}

	return resp.data;
}
