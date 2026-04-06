import type { z } from 'zod/v4';
import type { APIClient } from '../api.ts';
import {
	CoderSessionDataQuerySchema,
	CoderSessionEventHistorySchema,
	CoderSessionParticipantsSchema,
	CoderSessionReplaySchema,
	type CoderSessionDataQuery,
	type CoderSessionEventHistory,
	type CoderSessionParticipants,
	type CoderSessionReplay,
} from './types.ts';

export const CoderGetSessionReplayParamsSchema = CoderSessionDataQuerySchema.describe(
	'Parameters for retrieving session replay data'
);
export type CoderGetSessionReplayParams = z.infer<typeof CoderGetSessionReplayParamsSchema>;

export const CoderListParticipantsParamsSchema = CoderSessionDataQuerySchema.describe(
	'Parameters for listing session participants'
);
export type CoderListParticipantsParams = z.infer<typeof CoderListParticipantsParamsSchema>;

export const CoderListEventHistoryParamsSchema = CoderSessionDataQuerySchema.describe(
	'Parameters for listing session event history'
);
export type CoderListEventHistoryParams = z.infer<typeof CoderListEventHistoryParamsSchema>;

function buildSessionDataQuery(params: CoderSessionDataQuery): string {
	const query = new URLSearchParams();
	if (params.limit !== undefined) {
		query.set('limit', String(params.limit));
	}
	if (params.offset !== undefined) {
		query.set('offset', String(params.offset));
	}
	const queryString = query.toString();
	return queryString ? `?${queryString}` : '';
}

export async function coderGetReplay(
	client: APIClient,
	params: CoderGetSessionReplayParams
): Promise<CoderSessionReplay> {
	const path = `/hub/session/${encodeURIComponent(params.sessionId)}/replay${buildSessionDataQuery(params)}`;
	return client.get<CoderSessionReplay>(path, CoderSessionReplaySchema);
}

export async function coderListParticipants(
	client: APIClient,
	params: CoderListParticipantsParams
): Promise<CoderSessionParticipants> {
	const path = `/hub/session/${encodeURIComponent(params.sessionId)}/participants${buildSessionDataQuery(params)}`;
	return client.get<CoderSessionParticipants>(path, CoderSessionParticipantsSchema);
}

export async function coderListEventHistory(
	client: APIClient,
	params: CoderListEventHistoryParams
): Promise<CoderSessionEventHistory> {
	const path = `/hub/session/${encodeURIComponent(params.sessionId)}/events/history${buildSessionDataQuery(params)}`;
	return client.get<CoderSessionEventHistory>(path, CoderSessionEventHistorySchema);
}
