import { APIClient } from '../api.ts';
import { OAuthKeysRotateResponseSchema } from './types.ts';
import { OAuthResponseError } from './util.ts';

export async function oauthKeysRotate(client: APIClient): Promise<{ rotated: true }> {
	const resp = await client.post('/oidc/keys/rotate', undefined, OAuthKeysRotateResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}
