import { describe, test, expect } from 'bun:test';
import app from '../src/index';

describe('oauth app', () => {
	test('GET / returns HTML page', async () => {
		const res = await app.fetch(new Request('http://localhost/'));
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain('OAuth Demo');
	});

	test('GET /auth/me returns 500 without OAuth env vars', async () => {
		// Without OAUTH_ISSUER / OAUTH_AUTHORIZE_URL, buildAuthorizeUrl throws.
		// This verifies the route exists and hits the OAuth path.
		const res = await app.fetch(new Request('http://localhost/auth/me'));
		expect(res.status).toBe(500);
	});

	test('GET /auth/callback without code returns 400', async () => {
		const res = await app.fetch(new Request('http://localhost/auth/callback'));
		expect(res.status).toBe(400);
	});

	test('GET /auth/logout redirects to /', async () => {
		const res = await app.fetch(new Request('http://localhost/auth/logout'), {
			redirect: 'manual',
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/');
	});
});

describe.skip('deploy', () => {
	test('agentuity build produces valid output', async () => {
		// TODO: Run `agentuity build`, verify launch.json
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify the app is reachable
	});

	test('OAuth flow works end-to-end on deployed app', async () => {
		// TODO: Hit /auth/me, follow login URL, verify callback
	});
});
