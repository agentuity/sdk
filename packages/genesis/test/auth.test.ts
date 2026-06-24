import { describe, expect, test } from 'bun:test';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { createGenesisAuth } from '../src/auth/create-auth.ts';
import type { UpstreamIdentitySigningKey } from '../src/auth/types.ts';
import { verifyUpstreamIdentityToken } from '../src/auth/verify.ts';

async function testSigningMaterial(): Promise<{
	signingKey: UpstreamIdentitySigningKey;
	token: string;
}> {
	const { privateKey, publicKey } = await generateKeyPair('ES256');
	const publicKeyPEM = await exportSPKI(publicKey);
	const signingKey: UpstreamIdentitySigningKey = {
		issuer: 'agentuity-genesis-identity',
		algorithm: 'ES256',
		key_id: 'test-key',
		public_key_pem: publicKeyPEM,
		token_header: 'X-Genesis-Identity-Token',
		token_scope: 'upstream',
		token_audience_hint: 'project_id',
	};

	const token = await new SignJWT({
		scope: 'upstream',
		org_id: 'org-1',
		user_id: 'user-1',
		email: 'person@example.com',
	})
		.setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
		.setIssuer('agentuity-genesis-identity')
		.setSubject('genesis-user-1')
		.setAudience('proj-1')
		.setIssuedAt()
		.setExpirationTime('2m')
		.sign(privateKey);

	return { signingKey, token };
}

describe('verifyUpstreamIdentityToken', () => {
	test('validates ES256 upstream token', async () => {
		const { signingKey, token } = await testSigningMaterial();
		const identity = await verifyUpstreamIdentityToken(signingKey, token, 'proj-1');
		expect(identity.userId).toBe('user-1');
		expect(identity.genesisUserId).toBe('genesis-user-1');
		expect(identity.orgId).toBe('org-1');
	});
});

describe('createGenesisAuth', () => {
	test('authenticates request with hub signing key', async () => {
		const { signingKey, token } = await testSigningMaterial();
		const auth = createGenesisAuth({
			projectId: 'proj-1',
			fetchSigningKey: async () => signingKey,
		});

		const request = new Request('https://app.example.com/api', {
			headers: { 'X-Genesis-Identity-Token': token },
		});

		const result = await auth.authenticate(request);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.identity.userId).toBe('user-1');
		}
	});

	test('rejects missing token', async () => {
		const { signingKey } = await testSigningMaterial();
		const auth = createGenesisAuth({
			projectId: 'proj-1',
			fetchSigningKey: async () => signingKey,
		});

		const result = await auth.authenticate(new Request('https://app.example.com'));
		expect(result.ok).toBe(false);
	});

	test('defaults projectId from AGENTUITY_CLOUD_PROJECT_ID', async () => {
		const { signingKey, token } = await testSigningMaterial();
		const previous = process.env.AGENTUITY_CLOUD_PROJECT_ID;
		process.env.AGENTUITY_CLOUD_PROJECT_ID = 'proj-1';

		try {
			const auth = createGenesisAuth({
				fetchSigningKey: async () => signingKey,
			});
			const request = new Request('https://app.example.com/api', {
				headers: { 'X-Genesis-Identity-Token': token },
			});
			const result = await auth.authenticate(request);
			expect(result.ok).toBe(true);
		} finally {
			if (previous === undefined) {
				delete process.env.AGENTUITY_CLOUD_PROJECT_ID;
			} else {
				process.env.AGENTUITY_CLOUD_PROJECT_ID = previous;
			}
		}
	});
});
