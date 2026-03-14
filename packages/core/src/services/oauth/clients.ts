import { APIClient } from '../api.ts';
import { OAuthResponseError } from './util.ts';
import {
	OAuthClientCreateRequestSchema,
	OAuthClientCreateResponseSchema,
	OAuthClientDeleteResponseSchema,
	OAuthClientGetResponseSchema,
	OAuthClientListResponseSchema,
	OAuthClientRevokeAllUsersResponseSchema,
	OAuthClientRevokeUserResponseSchema,
	OAuthClientRotateSecretResponseSchema,
	OAuthClientUpdateRequestSchema,
	OAuthClientUpdateResponseSchema,
	OAuthClientUsersResponseSchema,
	type OAuthClientCreateData,
	type OAuthClientCreateRequest,
	type OAuthClientListItem,
	type OAuthClientUpdateData,
	type OAuthClientUpdateRequest,
	type OAuthConsentGrant,
	type OAuthRotateSecretData,
} from './types.ts';

export async function oauthClientList(client: APIClient): Promise<OAuthClientListItem[]> {
	const resp = await client.get('/oidc/clients', OAuthClientListResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthClientGet(client: APIClient, id: string): Promise<OAuthClientListItem> {
	const resp = await client.get(`/oidc/clients/${id}`, OAuthClientGetResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthClientCreate(
	client: APIClient,
	request: OAuthClientCreateRequest
): Promise<OAuthClientCreateData> {
	const resp = await client.post(
		'/oidc/clients',
		request,
		OAuthClientCreateResponseSchema,
		OAuthClientCreateRequestSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthClientUpdate(
	client: APIClient,
	id: string,
	request: OAuthClientUpdateRequest
): Promise<OAuthClientUpdateData> {
	const resp = await client.put(
		`/oidc/clients/${id}`,
		request,
		OAuthClientUpdateResponseSchema,
		OAuthClientUpdateRequestSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthClientDelete(client: APIClient, id: string): Promise<{ deleted: true }> {
	const resp = await client.delete(`/oidc/clients/${id}`, OAuthClientDeleteResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthClientRotateSecret(
	client: APIClient,
	id: string
): Promise<OAuthRotateSecretData> {
	const resp = await client.post(
		`/oidc/clients/${id}/rotate-secret`,
		undefined,
		OAuthClientRotateSecretResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthClientUsers(
	client: APIClient,
	id: string
): Promise<OAuthConsentGrant[]> {
	const resp = await client.get(`/oidc/clients/${id}/users`, OAuthClientUsersResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthClientRevokeAllUsers(
	client: APIClient,
	id: string
): Promise<{ deleted: true }> {
	const resp = await client.delete(
		`/oidc/clients/${id}/users`,
		OAuthClientRevokeAllUsersResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthClientRevokeUser(
	client: APIClient,
	id: string,
	userId: string
): Promise<{ deleted: true }> {
	const resp = await client.delete(
		`/oidc/clients/${id}/users/${userId}`,
		OAuthClientRevokeUserResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}
