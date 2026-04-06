import { z } from 'zod/v4';
import type { APIClient } from '../api.ts';
import { CoderLoopStateResponseSchema, type CoderLoopStateResponse } from './types.ts';

export const CoderGetLoopStateParamsSchema = z
	.object({
		sessionId: z.string().describe('Coder session identifier'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Parameters for retrieving loop state');
export type CoderGetLoopStateParams = z.infer<typeof CoderGetLoopStateParamsSchema>;

export async function coderGetLoopState(
	client: APIClient,
	params: CoderGetLoopStateParams
): Promise<CoderLoopStateResponse> {
	const path = `/hub/session/${encodeURIComponent(params.sessionId)}/loop`;
	return client.get<CoderLoopStateResponse>(path, CoderLoopStateResponseSchema);
}
