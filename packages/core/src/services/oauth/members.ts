import type { APIClient } from '../api.ts';
import { OAuthOrgMembersResponseSchema, type OAuthOrgMember } from './types.ts';
import { OAuthResponseError } from './util.ts';

export async function oauthOrgMembers(client: APIClient): Promise<OAuthOrgMember[]> {
	const resp = await client.get('/oidc/org/members', OAuthOrgMembersResponseSchema);

	if (resp.success) {
		return resp.data;
	}

	throw new OAuthResponseError({ message: resp.message });
}
