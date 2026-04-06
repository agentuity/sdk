import type { APIClient } from '../api.ts';
import { OAuthResponseError } from './util.ts';
import {
	OAuthBulkActivityResponseSchema,
	OAuthClientActivityResponseSchema,
	type OAuthBulkActivityItem,
	type OAuthClientActivityItem,
} from './types.ts';

export async function oauthClientActivity(
	client: APIClient,
	id: string,
	days?: number
): Promise<OAuthClientActivityItem[]> {
	const resp = await client.get(
		`/oidc/clients/${encodeURIComponent(id)}/activity${days ? `?days=${days}` : ''}`,
		OAuthClientActivityResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthBulkActivity(
	client: APIClient,
	days?: number
): Promise<OAuthBulkActivityItem[]> {
	const resp = await client.get(
		`/oidc/clients/activity${days ? `?days=${days}` : ''}`,
		OAuthBulkActivityResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}
