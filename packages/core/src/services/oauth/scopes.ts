import { APIClient } from '../api.ts';
import { OAuthScopesResponseSchema, type OAuthScopesData } from './types.ts';
import { OAuthResponseError } from './util.ts';

export async function oauthScopes(client: APIClient): Promise<OAuthScopesData> {
	const resp = await client.get('/oidc/scopes', OAuthScopesResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}
