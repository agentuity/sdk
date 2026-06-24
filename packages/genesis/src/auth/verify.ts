import { importSPKI, jwtVerify } from 'jose';
import type { GenesisIdentity, UpstreamIdentitySigningKey } from './types.ts';

let cachedKey: CryptoKey | null = null;
let cachedKeyPEM = '';

export async function importVerificationKey(publicKeyPEM: string): Promise<CryptoKey> {
	if (cachedKey && cachedKeyPEM === publicKeyPEM) {
		return cachedKey;
	}
	const key = await importSPKI(publicKeyPEM, 'ES256');
	cachedKey = key;
	cachedKeyPEM = publicKeyPEM;
	return key;
}

export async function verifyUpstreamIdentityToken(
	signingKey: UpstreamIdentitySigningKey,
	token: string,
	projectId: string
): Promise<GenesisIdentity> {
	const verificationKey = await importVerificationKey(signingKey.public_key_pem);
	const { payload } = await jwtVerify(token, verificationKey, {
		issuer: signingKey.issuer,
		audience: projectId,
		algorithms: ['ES256'],
	});

	if (payload.scope !== signingKey.token_scope) {
		throw new Error('invalid token scope');
	}

	const userId = stringClaim(payload.user_id);
	const genesisUserId = typeof payload.sub === 'string' ? payload.sub : '';
	const orgId = stringClaim(payload.org_id);
	const email = payload.email ? String(payload.email) : undefined;

	if (!userId || !genesisUserId || !orgId) {
		throw new Error('token missing required claims');
	}

	return {
		userId,
		genesisUserId,
		orgId,
		email,
		projectId,
	};
}

function stringClaim(value: unknown): string {
	return typeof value === 'string' ? value : '';
}
