import { z } from 'zod/v4';
import { type APIClient } from '../api.ts';
import {
	CoderListUsersParamsSchema,
	CoderListUsersResponseSchema,
	CoderUserSchema,
	type CoderListUsersParams,
	type CoderListUsersResponse,
} from './types.ts';

const CoderListUsersPayloadSchema = z
	.union([
		z.array(CoderUserSchema).describe('Array-only users payload from service'),
		CoderListUsersResponseSchema.describe('Object users payload from service'),
	])
	.describe('Raw users list payload shape returned by service');

export const CoderListUsersParamsWithOrgSchema = CoderListUsersParamsSchema.describe(
	'Parameters for listing coder users'
);
export type CoderListUsersParamsWithOrg = z.infer<typeof CoderListUsersParamsWithOrgSchema>;

function normalizeUsers(
	payload: z.infer<typeof CoderListUsersPayloadSchema>
): CoderListUsersResponse {
	if (Array.isArray(payload)) {
		return {
			users: payload,
			total: payload.length,
		};
	}

	return CoderListUsersResponseSchema.parse(payload);
}

export async function coderListUsers(
	client: APIClient,
	params?: CoderListUsersParams
): Promise<CoderListUsersResponse> {
	const query = new URLSearchParams();
	if (params?.search) {
		query.set('search', params.search);
	}
	if (params?.limit !== undefined) {
		query.set('limit', String(params.limit));
	}
	if (params?.offset !== undefined) {
		query.set('offset', String(params.offset));
	}

	const queryString = query.toString();
	const path = `/hub/users${queryString ? `?${queryString}` : ''}`;
	const payload = await client.get<z.infer<typeof CoderListUsersPayloadSchema>>(
		path,
		CoderListUsersPayloadSchema
	);

	return normalizeUsers(payload);
}
