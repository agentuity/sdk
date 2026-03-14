import { APIClient } from '../api.ts';
import {
	OAuthUserConsentResponseSchema,
	OAuthUserConsentRevokeResponseSchema,
	type OAuthUserConsent,
} from './types.ts';
import { OAuthResponseError } from './util.ts';

export async function oauthUserConsent(client: APIClient): Promise<OAuthUserConsent[]> {
	const resp = await client.get('/oidc/user/consent', OAuthUserConsentResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}

export async function oauthUserConsentRevoke(
	client: APIClient,
	clientId: string
): Promise<{ deleted: true }> {
	const resp = await client.delete(
		`/oidc/user/consent/${encodeURIComponent(clientId)}`,
		OAuthUserConsentRevokeResponseSchema
	);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}
