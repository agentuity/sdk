import { z } from 'zod';
import { type APIClient, APIResponseSchema } from '../api.ts';
import { SortDirectionSchema } from '../pagination.ts';
import { throwSandboxError } from './util.ts';

export const SandboxEventInfoSchema = z
	.object({
		eventId: z.string().describe('Unique identifier for the event'),
		sandboxId: z.string().describe('ID of the sandbox this event belongs to'),
		type: z.string().describe('Type of event (e.g., create, destroy, lifecycle:started)'),
		event: z.record(z.string(), z.unknown()).describe('Event data payload'),
		createdAt: z.string().describe('ISO timestamp when the event was recorded'),
	})
	.describe('Information about a sandbox event');

export const SandboxEventListDataSchema = z
	.object({
		events: z.array(SandboxEventInfoSchema).describe('List of sandbox events'),
	})
	.describe('List of events for a sandbox');

export const SandboxEventListResponseSchema = APIResponseSchema(SandboxEventListDataSchema);

export type SandboxEventInfo = z.infer<typeof SandboxEventInfoSchema>;

export const SandboxEventListParamsSchema = z.object({
	sandboxId: z.string().describe('sandbox id'),
	orgId: z.string().optional().describe('organization id'),
	limit: z.number().optional().describe('limit'),
	direction: SortDirectionSchema.optional().describe('sort direction (default: asc)'),
});
export type SandboxEventListParams = z.infer<typeof SandboxEventListParamsSchema>;

export type SandboxEventListResponse = z.infer<typeof SandboxEventListDataSchema>;

/**
 * Lists all events for a specific sandbox, ordered by creation time (oldest first by default).
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including the sandbox ID, optional limit, and sort direction
 * @returns List of event information for the sandbox
 * @throws {SandboxResponseError} If the sandbox is not found or request fails
 */
export async function sandboxEventList(
	client: APIClient,
	params: SandboxEventListParams
): Promise<SandboxEventListResponse> {
	const { sandboxId, orgId, limit, direction } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	if (limit !== undefined) {
		queryParams.set('limit', String(limit));
	}
	if (direction) {
		queryParams.set('direction', direction);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/sandboxes/${sandboxId}/events${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof SandboxEventListResponseSchema>>(
		url,
		SandboxEventListResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throwSandboxError(resp, { sandboxId });
}
