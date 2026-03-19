import { createRouter } from '@agentuity/runtime';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import type {} from '@agentuity/react';

const api = createRouter();

// Helper to build the OAuth authorize URL
function buildAuthorizeUrl(redirectUri: string): string {
	const params = new URLSearchParams({
		client_id: process.env.OAUTH_CLIENT_ID || '',
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: process.env.OAUTH_SCOPES || 'openid profile email',
	});
	return `${process.env.OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

// Helper to get the base URL from a request
function getBaseUrl(c: any): string {
	const url = new URL(c.req.url);
	return `${url.protocol}//${url.host}`;
}

// Check login status
api.get('/oauth/me', async (c) => {
	const session = getCookie(c, 'oauth_session');

	if (session) {
		try {
			const user = JSON.parse(decodeURIComponent(session));
			return c.json({ loggedIn: true, user });
		} catch {
			// Invalid cookie, treat as not logged in
			deleteCookie(c, 'oauth_session');
		}
	}

	const baseUrl = getBaseUrl(c);
	const redirectUri = `${baseUrl}/api/oauth/login`;
	const loginUrl = buildAuthorizeUrl(redirectUri);

	return c.json({ loggedIn: false, loginUrl });
});

// OAuth callback - exchanges code for token and fetches user info
api.get('/oauth/login', async (c) => {
	const code = c.req.query('code');

	if (!code) {
		return c.json({ error: 'No authorization code provided' }, 400);
	}

	const baseUrl = getBaseUrl(c);
	const redirectUri = `${baseUrl}/api/oauth/login`;

	try {
		// Exchange code for access token
		const tokenResponse = await fetch(process.env.OAUTH_TOKEN_URL!, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri,
				client_id: process.env.OAUTH_CLIENT_ID || '',
				client_secret: process.env.OAUTH_CLIENT_SECRET || '',
			}),
		});

		if (!tokenResponse.ok) {
			const error = await tokenResponse.text();
			return c.json({ error: 'Token exchange failed', details: error }, 500);
		}

		const tokenData = (await tokenResponse.json()) as { access_token: string };

		// Fetch user info
		const userResponse = await fetch(process.env.OAUTH_USERINFO_URL!, {
			headers: { Authorization: `Bearer ${tokenData.access_token}` },
		});

		if (!userResponse.ok) {
			const error = await userResponse.text();
			return c.json({ error: 'Failed to fetch user info', details: error }, 500);
		}

		const user = await userResponse.json();

		// Store user info in a cookie
		setCookie(c, 'oauth_session', encodeURIComponent(JSON.stringify(user)), {
			path: '/',
			httpOnly: true,
			secure: false, // set to true in production
			sameSite: 'Lax',
			maxAge: 60 * 60 * 24, // 24 hours
		});

		// Redirect to home page
		return c.redirect('/');
	} catch (err) {
		return c.json({ error: 'OAuth flow failed', details: String(err) }, 500);
	}
});

// Logout - clear session
api.get('/oauth/logout', async (c) => {
	deleteCookie(c, 'oauth_session', { path: '/' });
	return c.redirect('/');
});

export default api;
